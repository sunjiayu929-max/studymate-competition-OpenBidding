"""Create a temporally stable transparent idle loop from extracted PNG frames.

The source loop contains only subtle motion, so one averaged person matte is
shared by every frame. This prevents the edge shimmer produced by running an
independent segmentation threshold on each frame.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import shutil

import numpy as np
from PIL import Image, ImageFilter
from scipy.ndimage import distance_transform_edt
import torch
from torchvision.models.segmentation import (
    DeepLabV3_ResNet50_Weights,
    deeplabv3_resnet50,
)
from torchvision.transforms import functional as transforms


CANVAS_SIZE = (360, 480)
MODEL_SIZE = (512, 288)
MATTE_SAMPLE_COUNT = 7


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("frames", type=Path, help="Directory containing frame-*.png")
    parser.add_argument("output", type=Path, help="Directory for transparent RGBA frames")
    parser.add_argument("--poster", type=Path, required=True, help="Transparent PNG poster path")
    return parser.parse_args()


def model_input(image: Image.Image) -> torch.Tensor:
    resized = image.convert("RGB").resize(MODEL_SIZE, Image.Resampling.BILINEAR)
    tensor = transforms.pil_to_tensor(resized).float().div_(255)
    return transforms.normalize(
        tensor,
        mean=(0.485, 0.456, 0.406),
        std=(0.229, 0.224, 0.225),
    )


def person_matte(frames: list[Path], source_size: tuple[int, int]) -> Image.Image:
    weights = DeepLabV3_ResNet50_Weights.DEFAULT
    model = deeplabv3_resnet50(weights=weights).eval()
    sample_indexes = np.linspace(0, len(frames) - 1, MATTE_SAMPLE_COUNT, dtype=int)
    batch = torch.stack([model_input(Image.open(frames[index])) for index in sample_indexes])

    with torch.inference_mode():
        logits = model(batch)["out"]
        probability = torch.softmax(logits, dim=1)[:, 15].mean(dim=0)

    probability_image = Image.fromarray(
        np.uint8(np.clip(probability.cpu().numpy(), 0, 1) * 255),
        mode="L",
    ).resize(source_size, Image.Resampling.BICUBIC)
    probability_array = np.asarray(probability_image, dtype=np.float32) / 255

    # Suppress low-confidence classroom pixels and keep a soft 2–4 px edge.
    alpha = np.clip((probability_array - 0.38) / 0.38, 0, 1)
    alpha = np.power(alpha, 0.9)
    matte = Image.fromarray(np.uint8(alpha * 255), mode="L")
    return matte.filter(ImageFilter.MinFilter(size=3)).filter(ImageFilter.GaussianBlur(radius=0.85))


def crop_box(matte: Image.Image) -> tuple[int, int, int, int]:
    alpha = np.asarray(matte)
    ys, xs = np.where(alpha >= 52)
    if not len(xs):
        raise RuntimeError("The person segmentation did not produce a usable matte")
    left = max(0, int(xs.min()) - 24)
    top = max(0, int(ys.min()) - 16)
    right = min(matte.width, int(xs.max()) + 25)
    bottom = min(matte.height, int(ys.max()) + 1)
    return left, top, right, bottom


def compose_frame(
    image: Image.Image,
    matte: Image.Image,
    box: tuple[int, int, int, int],
    nearest_opaque: tuple[np.ndarray, np.ndarray],
) -> Image.Image:
    rgb = np.asarray(image.convert("RGB")).copy()
    alpha = np.asarray(matte)
    fringe = (alpha > 0) & (alpha < 248)
    nearest_y, nearest_x = nearest_opaque
    rgb[fringe] = rgb[nearest_y[fringe], nearest_x[fringe]]
    rgba = Image.fromarray(np.dstack((rgb, alpha)), mode="RGBA")
    subject = rgba.crop(box)

    max_width, max_height = 324, 462
    scale = min(max_width / subject.width, max_height / subject.height)
    target = (
        max(1, round(subject.width * scale)),
        max(1, round(subject.height * scale)),
    )
    subject = subject.resize(target, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    x = (CANVAS_SIZE[0] - target[0]) // 2
    y = CANVAS_SIZE[1] - target[1] - 6
    canvas.alpha_composite(subject, (x, y))
    return canvas


def main() -> None:
    args = parse_args()
    frames = sorted(args.frames.glob("frame-*.png"))
    if not frames:
        raise FileNotFoundError(f"No frame-*.png files found in {args.frames}")

    args.output.mkdir(parents=True, exist_ok=True)
    args.poster.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(frames[0]) as first:
        source_size = first.size
    matte = person_matte(frames, source_size)
    box = crop_box(matte)
    _, nearest_opaque = distance_transform_edt(
        np.asarray(matte) < 238,
        return_indices=True,
    )

    poster_source: Path | None = None
    for index, frame_path in enumerate(frames):
        with Image.open(frame_path) as image:
            output = compose_frame(image, matte, box, nearest_opaque)
        output_path = args.output / f"frame-{index + 1:03d}.png"
        output.save(output_path, optimize=True)
        if index == len(frames) // 2:
            poster_source = output_path

    if poster_source is None:
        raise RuntimeError("Poster frame was not produced")
    shutil.copyfile(poster_source, args.poster)
    print(f"Created {len(frames)} transparent frames; crop={box}; canvas={CANVAS_SIZE}")


if __name__ == "__main__":
    main()
