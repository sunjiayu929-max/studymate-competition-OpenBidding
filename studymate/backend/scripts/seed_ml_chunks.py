"""
机器学习课程种子知识库。30+ chunks，覆盖：
- 监督学习（线性回归、逻辑回归、SVM、决策树、随机森林、KNN、朴素贝叶斯）
- 无监督学习（K-Means、PCA、层次聚类）
- 模型评估（混淆矩阵、ROC、交叉验证、过拟合）
- 优化（梯度下降、SGD、Adam）
- 神经网络基础（感知机、反向传播、激活函数）

每条 chunk 标注 source/page/url，供引用追溯。
来源说明：以下文本为本项目原创整理用于演示，归纳自《统计学习方法》《机器学习》（周志华）
及 scikit-learn 官方文档等公开材料。生产部署前应替换为版权清晰的语料。

运行：
    cd backend
    .venv/Scripts/python.exe -m scripts.seed_ml_chunks
"""
import asyncio
import sys
from pathlib import Path

# 允许 python -m scripts.seed_ml_chunks 和直接 python 都跑
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.session import engine, Base
from app.db import models  # noqa: F401
from app.rag import get_rag_service


CHUNKS = [
    # ===== 监督学习 =====
    {
        "content": "监督学习（Supervised Learning）是机器学习的基本范式之一。给定带标签的训练样本 (x_i, y_i)，目标是学习一个映射 f: X → Y，使得对新样本 x，能预测其标签 y。分类任务的 y 是离散类别，回归任务的 y 是连续数值。",
        "source": "教材·机器学习导论",
        "page": 3,
        "url": "doc://ml-intro#ch1",
        "meta": {"topic": "概念", "difficulty": 1},
    },
    {
        "content": "线性回归（Linear Regression）假设目标变量与特征之间存在线性关系：y = w·x + b。通过最小化均方误差 L = Σ(y_i - ŷ_i)² 求解参数。解析解为 w = (XᵀX)⁻¹Xᵀy（正规方程），也可用梯度下降迭代优化。",
        "source": "教材·线性模型",
        "page": 24,
        "url": "doc://linear-models#linear-regression",
        "meta": {"topic": "线性回归", "difficulty": 2},
    },
    {
        "content": "逻辑回归（Logistic Regression）虽名为回归，实为二分类模型。其将线性组合通过 Sigmoid 函数 σ(z)=1/(1+e^(-z)) 映射到 (0,1)，表示样本属于正类的概率。损失函数为交叉熵 L = -Σ[y log(ŷ) + (1-y) log(1-ŷ)]。",
        "source": "教材·线性模型",
        "page": 38,
        "url": "doc://linear-models#logistic-regression",
        "meta": {"topic": "逻辑回归", "difficulty": 2},
    },
    {
        "content": "支持向量机（SVM, Support Vector Machine）通过寻找最大间隔超平面对样本分类。对于线性不可分数据，引入核函数（如 RBF、多项式核）将样本映射到高维空间。常用软间隔变体，通过参数 C 控制分类错误与间隔大小的权衡。",
        "source": "教材·支持向量机",
        "page": 121,
        "url": "doc://svm",
        "meta": {"topic": "SVM", "difficulty": 4},
    },
    {
        "content": "决策树（Decision Tree）通过递归地选择最优特征切分数据来构建分类或回归模型。ID3 用信息增益，C4.5 用信息增益率，CART 用基尼指数。决策树易于解释但容易过拟合，需要剪枝。",
        "source": "教材·决策树",
        "page": 73,
        "url": "doc://decision-tree",
        "meta": {"topic": "决策树", "difficulty": 2},
    },
    {
        "content": "随机森林（Random Forest）是决策树的集成方法。通过 Bootstrap 抽样训练多棵树，每次分裂时只在随机选择的特征子集上找最优切分，最后投票或平均。能显著降低方差，是工业界常用的强 baseline。",
        "source": "教材·集成学习",
        "page": 158,
        "url": "doc://ensemble#random-forest",
        "meta": {"topic": "随机森林", "difficulty": 3},
    },
    {
        "content": "KNN（K-Nearest Neighbors）是一种基于实例的惰性学习方法。预测时找到训练集中距离待预测样本最近的 K 个样本，用它们的标签投票（分类）或平均（回归）。K 通常取奇数避免平票，距离度量常用欧氏距离或曼哈顿距离。",
        "source": "教材·非参数方法",
        "page": 51,
        "url": "doc://knn",
        "meta": {"topic": "KNN", "difficulty": 2},
    },
    {
        "content": "朴素贝叶斯（Naive Bayes）基于贝叶斯定理 P(y|x) ∝ P(y)·P(x|y)，并假设特征条件独立。常用变体：高斯朴素贝叶斯（连续特征）、多项式朴素贝叶斯（文本分类）、伯努利朴素贝叶斯（二值特征）。",
        "source": "教材·贝叶斯方法",
        "page": 95,
        "url": "doc://naive-bayes",
        "meta": {"topic": "朴素贝叶斯", "difficulty": 2},
    },
    {
        "content": "梯度提升树（Gradient Boosting Decision Tree, GBDT）是一种 Boosting 集成方法。每棵树拟合前面所有树预测的残差，逐步降低损失。XGBoost、LightGBM、CatBoost 是工业界广泛使用的高效实现。",
        "source": "教材·集成学习",
        "page": 172,
        "url": "doc://ensemble#gbdt",
        "meta": {"topic": "GBDT", "difficulty": 4},
    },

    # ===== 无监督学习 =====
    {
        "content": "K-Means 聚类算法将数据划分为 K 个簇。初始化 K 个中心点后迭代：(1) 将每个样本分配到最近中心；(2) 重新计算每个簇的中心。直到中心不再变化。对初始化敏感，K-Means++ 是更稳定的初始化方法。",
        "source": "教材·聚类",
        "page": 196,
        "url": "doc://clustering#kmeans",
        "meta": {"topic": "K-Means", "difficulty": 2},
    },
    {
        "content": "主成分分析（PCA, Principal Component Analysis）通过线性变换将高维数据投影到正交主成分上，保留最大方差方向。常用于降维、可视化、特征压缩。数学上等价于对协方差矩阵做特征值分解，或对数据矩阵做 SVD。",
        "source": "教材·降维",
        "page": 215,
        "url": "doc://dimreduce#pca",
        "meta": {"topic": "PCA", "difficulty": 3},
    },
    {
        "content": "层次聚类（Hierarchical Clustering）通过递归地合并（凝聚式）或分裂（分裂式）样本构建聚类树（树状图）。不需要预先指定 K，但计算复杂度高 O(n²) 以上。常用链接方式：single / complete / average / ward。",
        "source": "教材·聚类",
        "page": 207,
        "url": "doc://clustering#hierarchical",
        "meta": {"topic": "层次聚类", "difficulty": 3},
    },
    {
        "content": "DBSCAN 是基于密度的聚类算法，无需指定簇的数目，能发现任意形状的簇并识别噪声点。两个关键参数：邻域半径 ε 和最小样本数 MinPts。点分为核心点、边界点、噪声点三类。",
        "source": "教材·聚类",
        "page": 211,
        "url": "doc://clustering#dbscan",
        "meta": {"topic": "DBSCAN", "difficulty": 3},
    },

    # ===== 模型评估 =====
    {
        "content": "混淆矩阵（Confusion Matrix）是分类模型评估的核心工具。对二分类问题，矩阵的四个元素分别为：真阳 TP、假阳 FP、假阴 FN、真阴 TN。精确率 Precision = TP/(TP+FP)，召回率 Recall = TP/(TP+FN)，F1 = 2PR/(P+R)。",
        "source": "教材·模型评估",
        "page": 28,
        "url": "doc://evaluation#confusion-matrix",
        "meta": {"topic": "评估指标", "difficulty": 2},
    },
    {
        "content": "ROC 曲线以假阳率 FPR 为横轴、真阳率 TPR 为纵轴，描述分类阈值变化下的模型性能。AUC（Area Under Curve）是 ROC 曲线下面积，越接近 1 表示分类器越好。AUC 对类别不平衡相对鲁棒。",
        "source": "教材·模型评估",
        "page": 32,
        "url": "doc://evaluation#roc-auc",
        "meta": {"topic": "ROC/AUC", "difficulty": 2},
    },
    {
        "content": "K 折交叉验证（K-Fold Cross Validation）将数据划分为 K 份，每次用 K-1 份训练、1 份验证，重复 K 次，结果取平均。能更稳健地估计泛化性能，常用 K=5 或 10。分层 K 折（Stratified K-Fold）保持每折类别比例。",
        "source": "教材·模型评估",
        "page": 40,
        "url": "doc://evaluation#k-fold",
        "meta": {"topic": "交叉验证", "difficulty": 2},
    },
    {
        "content": "过拟合（Overfitting）指模型在训练集上表现好但在测试集上差。常见表现：训练误差远低于验证误差。缓解方法：增加数据、正则化（L1/L2）、Dropout、提前停止、降低模型复杂度、数据增强。",
        "source": "教材·泛化理论",
        "page": 18,
        "url": "doc://generalization#overfitting",
        "meta": {"topic": "过拟合", "difficulty": 2},
    },
    {
        "content": "偏差-方差权衡（Bias-Variance Tradeoff）：模型总误差 = 偏差² + 方差 + 噪声。高偏差（欠拟合）模型过于简单，高方差（过拟合）模型过于复杂。集成方法（如 Bagging 降方差、Boosting 降偏差）是经典的权衡手段。",
        "source": "教材·泛化理论",
        "page": 22,
        "url": "doc://generalization#bias-variance",
        "meta": {"topic": "偏差方差", "difficulty": 3},
    },

    # ===== 优化 =====
    {
        "content": "梯度下降（Gradient Descent）沿负梯度方向迭代更新参数：w ← w - η∇L(w)，η 为学习率。批量梯度下降每步用全部样本，小批量随机梯度下降（Mini-batch SGD）每步用 batch 个样本，是深度学习的标配。",
        "source": "教材·优化算法",
        "page": 56,
        "url": "doc://optimization#gd",
        "meta": {"topic": "梯度下降", "difficulty": 2},
    },
    {
        "content": "Adam 优化器结合了动量（Momentum）和自适应学习率（RMSProp）。维护梯度的一阶矩 m 和二阶矩 v，并做偏差修正。默认超参 β1=0.9, β2=0.999, ε=1e-8。是深度学习中最常用的优化器之一。",
        "source": "教材·优化算法",
        "page": 71,
        "url": "doc://optimization#adam",
        "meta": {"topic": "Adam", "difficulty": 3},
    },
    {
        "content": "学习率调度（Learning Rate Scheduling）：固定学习率往往不是最优。常见策略：步进衰减（StepLR）、余弦退火（Cosine Annealing）、Warmup（前期线性升高再衰减）、Reduce-On-Plateau（验证指标停滞时减半）。",
        "source": "教材·优化算法",
        "page": 78,
        "url": "doc://optimization#lr-schedule",
        "meta": {"topic": "学习率调度", "difficulty": 3},
    },

    # ===== 神经网络基础 =====
    {
        "content": "感知机（Perceptron）是最简单的神经网络单元：y = sign(w·x + b)。对线性可分数据可收敛，但无法解决异或（XOR）等非线性问题，这一局限催生了多层感知机和深度学习。",
        "source": "教材·神经网络",
        "page": 102,
        "url": "doc://nn#perceptron",
        "meta": {"topic": "感知机", "difficulty": 2},
    },
    {
        "content": "反向传播（Backpropagation）通过链式法则高效计算神经网络中所有参数的梯度。从输出层向输入层逐层传播误差，每层根据局部梯度更新权重。配合自动微分（Autograd），是现代深度学习框架的基石。",
        "source": "教材·神经网络",
        "page": 118,
        "url": "doc://nn#backprop",
        "meta": {"topic": "反向传播", "difficulty": 3},
    },
    {
        "content": "激活函数（Activation Function）为神经网络引入非线性。常见选择：Sigmoid（容易梯度消失）、Tanh（零中心）、ReLU max(0,x)（计算快，主流选择）、LeakyReLU、GELU（Transformer 中常用）、Swish。",
        "source": "教材·神经网络",
        "page": 125,
        "url": "doc://nn#activation",
        "meta": {"topic": "激活函数", "difficulty": 2},
    },
    {
        "content": "Dropout 是一种正则化技巧：训练时按概率 p 随机置零部分神经元，强制网络不依赖任何单一单元。测试时关闭 Dropout 并将权重乘以 (1-p) 或等价地在训练时除以 (1-p)（inverted dropout）。",
        "source": "教材·正则化",
        "page": 141,
        "url": "doc://regularization#dropout",
        "meta": {"topic": "Dropout", "difficulty": 2},
    },
    {
        "content": "批归一化（Batch Normalization）在每个 mini-batch 内对每个特征做归一化（减均值除标准差），再做可学习的缩放和平移。能加速训练、允许更大学习率、轻微正则化。Layer Norm / Group Norm 是其变体。",
        "source": "教材·正则化",
        "page": 148,
        "url": "doc://regularization#batchnorm",
        "meta": {"topic": "BatchNorm", "difficulty": 3},
    },

    # ===== 特征工程 =====
    {
        "content": "特征工程（Feature Engineering）是将原始数据转换为模型友好特征的过程。常见操作：缺失值填充、标准化（Z-Score）、归一化（Min-Max）、独热编码、目标编码、分箱、交叉特征、对数变换。Garbage in, garbage out。",
        "source": "教材·特征工程",
        "page": 8,
        "url": "doc://features",
        "meta": {"topic": "特征工程", "difficulty": 2},
    },
    {
        "content": "类别特征处理：低基数用独热编码（One-Hot）；高基数避免维度灾难，可用目标编码（Target Encoding）、频数编码、嵌入（Embedding）。注意目标编码要在交叉验证 fold 内拟合，否则泄漏。",
        "source": "教材·特征工程",
        "page": 14,
        "url": "doc://features#categorical",
        "meta": {"topic": "类别特征", "difficulty": 2},
    },
    {
        "content": "类别不平衡（Class Imbalance）处理：过采样（SMOTE）、欠采样、调整 class_weight、改阈值、用对不平衡鲁棒的指标（F1、PR-AUC 优于准确率）、集成方法。诈骗检测、罕见病诊断是经典场景。",
        "source": "教材·特征工程",
        "page": 20,
        "url": "doc://features#imbalance",
        "meta": {"topic": "类别不平衡", "difficulty": 3},
    },

    # ===== 实践 =====
    {
        "content": "scikit-learn 工作流：使用 Pipeline 把预处理和模型串起来 → 用 GridSearchCV / RandomizedSearchCV 调参 → cross_val_score 评估 → fit 全量训练 → predict / predict_proba 预测。Pipeline 防止数据泄漏，是规范做法。",
        "source": "scikit-learn 文档",
        "page": None,
        "url": "https://scikit-learn.org/stable/modules/compose.html",
        "meta": {"topic": "实践·sklearn", "difficulty": 2},
    },
    {
        "content": "数据划分原则：将数据分为训练集、验证集（用于调参）、测试集（最终评估，只能看一次）。常见比例 60/20/20 或 70/15/15。时间序列要按时间切，不能随机；分组数据要按组切，避免泄漏。",
        "source": "教材·实践要点",
        "page": 5,
        "url": "doc://practice#data-split",
        "meta": {"topic": "数据划分", "difficulty": 1},
    },

    # ===== 监督学习补充：损失 / 数学推导 =====
    {
        "content": "Ridge 回归（L2 正则）的解析解为 w = (XᵀX + λI)⁻¹Xᵀy。加上 λI 让矩阵可逆，缓解多重共线性，权重整体变小但不为零。λ 越大正则越强、偏差越大、方差越小。",
        "source": "教材·线性模型", "page": 32, "url": "doc://linear-models#ridge",
        "meta": {"topic": "Ridge", "difficulty": 3},
    },
    {
        "content": "Lasso 回归（L1 正则）目标 min‖y-Xw‖² + λ‖w‖₁。L1 在零点不可导，常用坐标下降或近端梯度法求解。L1 产生稀疏解，可做特征选择，但相关特征之间会随机挑一个。",
        "source": "教材·线性模型", "page": 35, "url": "doc://linear-models#lasso",
        "meta": {"topic": "Lasso", "difficulty": 3},
    },
    {
        "content": "弹性网（ElasticNet）= α·L1 + (1-α)·L2。综合 L1 的稀疏性和 L2 的稳定性，特征高度相关时优于纯 Lasso。sklearn 中 ElasticNet 的 l1_ratio 即 α。",
        "source": "教材·线性模型", "page": 40, "url": "doc://linear-models#elasticnet",
        "meta": {"topic": "ElasticNet", "difficulty": 3},
    },
    {
        "content": "最大似然估计（MLE, Maximum Likelihood Estimation）：找使观测数据概率最大的参数。线性回归在高斯噪声假设下，MLE 等价于最小二乘；逻辑回归在伯努利假设下，MLE 等价于最小化交叉熵。",
        "source": "教材·概率统计基础", "page": 12, "url": "doc://stats#mle",
        "meta": {"topic": "MLE", "difficulty": 3},
    },
    {
        "content": "最大后验估计（MAP）= MLE + 先验。等价于带正则的 MLE：高斯先验 → L2 正则；拉普拉斯先验 → L1 正则。这是正则化的贝叶斯解释。",
        "source": "教材·概率统计基础", "page": 16, "url": "doc://stats#map",
        "meta": {"topic": "MAP", "difficulty": 4},
    },
    {
        "content": "EM 算法（期望最大化）解含隐变量的极大似然问题。E 步：基于当前参数估计隐变量分布；M 步：在该分布下重新最大化对数似然。GMM、HMM、LDA 的核心训练算法。EM 收敛到局部最优。",
        "source": "教材·概率统计基础", "page": 88, "url": "doc://stats#em",
        "meta": {"topic": "EM 算法", "difficulty": 4},
    },
    {
        "content": "高斯混合模型（GMM, Gaussian Mixture Model）假设数据由 K 个高斯分布混合生成，参数 = 各高斯的均值、协方差、权重。用 EM 训练。相比 K-Means，GMM 是软聚类（给出每个簇的概率），能拟合椭圆形簇。",
        "source": "教材·聚类", "page": 220, "url": "doc://clustering#gmm",
        "meta": {"topic": "GMM", "difficulty": 4},
    },

    # ===== 损失函数 =====
    {
        "content": "MSE（均方误差）= (1/n)Σ(y-ŷ)²，对离群点敏感（平方放大误差）。MAE（平均绝对误差）= (1/n)Σ|y-ŷ|，对离群点鲁棒但零点不可导。Huber Loss 结合二者：误差小时用 MSE，大时用 MAE。",
        "source": "教材·损失函数", "page": 4, "url": "doc://loss#regression",
        "meta": {"topic": "回归损失", "difficulty": 2},
    },
    {
        "content": "交叉熵损失（Cross-Entropy）= -Σy log(ŷ)，用于分类。二分类版本：BCE = -[y log(ŷ) + (1-y) log(1-ŷ)]。softmax + 交叉熵的梯度是 (ŷ-y)，计算简洁，是分类网络的标配。",
        "source": "教材·损失函数", "page": 12, "url": "doc://loss#ce",
        "meta": {"topic": "交叉熵", "difficulty": 2},
    },
    {
        "content": "Focal Loss = -(1-p)^γ log(p)，给好分类样本降权、难分类样本增权。RetinaNet 提出，用于目标检测中正负样本严重不平衡的场景。γ 通常取 2。",
        "source": "论文·Focal Loss", "page": None, "url": "https://arxiv.org/abs/1708.02002",
        "meta": {"topic": "Focal Loss", "difficulty": 4},
    },
    {
        "content": "Hinge Loss = max(0, 1 - y·ŷ)，SVM 使用。只惩罚预测在错误一侧或离决策边界太近的样本，离边界足够远的样本损失为 0，因此 SVM 解依赖于「支持向量」。",
        "source": "教材·支持向量机", "page": 130, "url": "doc://svm#hinge",
        "meta": {"topic": "Hinge Loss", "difficulty": 3},
    },
    {
        "content": "KL 散度 D_KL(P‖Q) = Σ P(x) log(P(x)/Q(x))，衡量两个分布的差异。非对称：D_KL(P‖Q) ≠ D_KL(Q‖P)。分类交叉熵实质是预测分布与 one-hot 真实分布的 KL 散度。",
        "source": "教材·信息论", "page": 7, "url": "doc://info#kl",
        "meta": {"topic": "KL 散度", "difficulty": 3},
    },
    {
        "content": "Label Smoothing（标签平滑）：把硬标签 [0,0,1,0] 改成 [0.025,0.025,0.925,0.025]。防止模型对预测过于自信，提升泛化，是分类训练常见 trick。",
        "source": "教材·正则化", "page": 156, "url": "doc://regularization#label-smoothing",
        "meta": {"topic": "Label Smoothing", "difficulty": 3},
    },

    # ===== 模型评估补充 =====
    {
        "content": "Macro-F1 vs Micro-F1：Macro 先对每类算 F1 再平均，类别权重相同，适合关注少数类；Micro 先汇总所有 TP/FP/FN 再算 F1，等价于准确率（多分类），偏向多数类。不平衡场景选 Macro。",
        "source": "教材·模型评估", "page": 38, "url": "doc://evaluation#macro-micro",
        "meta": {"topic": "Macro/Micro", "difficulty": 3},
    },
    {
        "content": "PR-AUC（Precision-Recall 曲线下面积）在类别极度不平衡时比 ROC-AUC 更敏感，因 ROC 的 FPR 分母含大量真负样本会冲淡假阳率变化。诈骗检测、罕见病诊断常选 PR-AUC。",
        "source": "教材·模型评估", "page": 36, "url": "doc://evaluation#pr-auc",
        "meta": {"topic": "PR-AUC", "difficulty": 3},
    },
    {
        "content": "对数损失（Log Loss）= -(1/n)Σ[y log(ŷ) + (1-y) log(1-ŷ)]，对概率预测的质量打分。预测越接近真实标签损失越低，预测错误且自信时惩罚极重。Kaggle 二分类比赛常用。",
        "source": "教材·模型评估", "page": 44, "url": "doc://evaluation#logloss",
        "meta": {"topic": "Log Loss", "difficulty": 2},
    },
    {
        "content": "回归评估指标：MSE 平方误差，单位是 y 单位的平方；RMSE 开方后单位与 y 一致；MAE 鲁棒；R² 决定系数，1 完美 / 0 等于平均预测 / 负数说明比平均还差；MAPE 百分比误差，y 接近 0 时爆炸。",
        "source": "教材·模型评估", "page": 50, "url": "doc://evaluation#regression",
        "meta": {"topic": "回归指标", "difficulty": 2},
    },
    {
        "content": "学习曲线（Learning Curve）画训练样本数 vs 训练/验证误差。两条线都高且接近 → 欠拟合（高偏差）；训练低验证高且差距大 → 过拟合（高方差）；都低且接近 → 模型刚好。诊断模型问题的利器。",
        "source": "教材·模型评估", "page": 56, "url": "doc://evaluation#learning-curve",
        "meta": {"topic": "学习曲线", "difficulty": 3},
    },
    {
        "content": "嵌套交叉验证（Nested CV）：外层 K 折估计泛化，内层 K 折调超参。避免「同一份数据既调参又评估」的乐观偏差。计算贵但严谨，论文级评估常用。",
        "source": "教材·模型评估", "page": 62, "url": "doc://evaluation#nested-cv",
        "meta": {"topic": "Nested CV", "difficulty": 4},
    },

    # ===== 优化器补充 =====
    {
        "content": "动量（Momentum）SGD：v = βv + (1-β)∇L; w = w - ηv。把历史梯度的指数平均当作更新方向，能加速收敛、减少震荡。β 通常 0.9。",
        "source": "教材·优化算法", "page": 60, "url": "doc://optimization#momentum",
        "meta": {"topic": "Momentum", "difficulty": 3},
    },
    {
        "content": "Nesterov 加速梯度（NAG）：先按动量「前瞻」一步再算梯度，比朴素 Momentum 收敛更快。w_lookahead = w - βv; v = βv + (1-β)∇L(w_lookahead); w = w - ηv。",
        "source": "教材·优化算法", "page": 63, "url": "doc://optimization#nesterov",
        "meta": {"topic": "Nesterov", "difficulty": 4},
    },
    {
        "content": "AdaGrad：累计梯度平方做分母，对低频参数学习率自然增大、高频减小。问题：分母单调递增，学习率最终趋零，长期训练失效。RMSProp 用指数移动平均改进。",
        "source": "教材·优化算法", "page": 66, "url": "doc://optimization#adagrad",
        "meta": {"topic": "AdaGrad", "difficulty": 3},
    },
    {
        "content": "RMSProp = AdaGrad 改进版：用衰减系数 ρ（通常 0.9）做梯度平方的指数移动平均做分母，避免学习率单调下降。是 Adam 的雏形。",
        "source": "教材·优化算法", "page": 68, "url": "doc://optimization#rmsprop",
        "meta": {"topic": "RMSProp", "difficulty": 3},
    },
    {
        "content": "AdamW = Adam + 解耦权重衰减。原版 Adam 把 weight decay 当作 L2 加到梯度里，与自适应学习率耦合导致正则化偏弱。AdamW 把权重衰减直接乘在参数上，是 Transformer / BERT 训练的标配。",
        "source": "论文·AdamW", "page": None, "url": "https://arxiv.org/abs/1711.05101",
        "meta": {"topic": "AdamW", "difficulty": 4},
    },
    {
        "content": "梯度裁剪（Gradient Clipping）：把梯度的范数 / 元素值限制在阈值内。常用于 RNN 防止梯度爆炸。norm 方式 g ← g·min(1, max_norm/‖g‖) 更常见。",
        "source": "教材·优化算法", "page": 82, "url": "doc://optimization#clip",
        "meta": {"topic": "梯度裁剪", "difficulty": 3},
    },
    {
        "content": "Warmup 学习率：训练初期 N 步线性从 0 升到目标学习率，避免大学习率破坏未学好的权重。Transformer 训练常配合 warmup_steps=4000 + 平方根衰减。",
        "source": "论文·Transformer", "page": None, "url": "https://arxiv.org/abs/1706.03762",
        "meta": {"topic": "Warmup", "difficulty": 3},
    },

    # ===== 深度学习 - CNN =====
    {
        "content": "卷积神经网络（CNN, Convolutional Neural Network）核心是卷积层和池化层。卷积层通过共享卷积核扫描输入，提取局部特征并保留空间结构。参数远少于全连接，是图像/视频的主流架构。",
        "source": "教材·深度学习", "page": 8, "url": "doc://dl#cnn",
        "meta": {"topic": "CNN", "difficulty": 3},
    },
    {
        "content": "卷积层超参：核大小（kernel size，常用 3×3）、步长（stride）、填充（padding，「same」保持尺寸 / 「valid」不填）、通道数（输出特征图数）。感受野随网络深度增大。",
        "source": "教材·深度学习", "page": 14, "url": "doc://dl#conv-params",
        "meta": {"topic": "卷积参数", "difficulty": 3},
    },
    {
        "content": "池化层（Pooling）下采样降低空间分辨率：Max Pooling 取邻域最大值（保留显著特征），Average Pooling 取均值（平滑），Global Average Pooling 把整张特征图压成一个数，替代全连接，参数更少。",
        "source": "教材·深度学习", "page": 18, "url": "doc://dl#pooling",
        "meta": {"topic": "池化", "difficulty": 2},
    },
    {
        "content": "经典 CNN 架构演进：LeNet-5（1998 手写数字）→ AlexNet（2012 ImageNet 突破）→ VGG（统一 3×3 小卷积）→ GoogLeNet/Inception（多尺度并行）→ ResNet（残差连接，可训上百层）→ EfficientNet（复合缩放）。",
        "source": "教材·深度学习", "page": 28, "url": "doc://dl#cnn-history",
        "meta": {"topic": "CNN 架构", "difficulty": 3},
    },
    {
        "content": "ResNet 的残差连接（Residual Connection）y = F(x) + x，让梯度可以直接绕过若干层反传，缓解深网络的梯度消失，允许训练 152 层甚至 1000+ 层。是现代 CNN/Transformer 的基础组件。",
        "source": "论文·ResNet", "page": None, "url": "https://arxiv.org/abs/1512.03385",
        "meta": {"topic": "ResNet", "difficulty": 3},
    },
    {
        "content": "迁移学习（Transfer Learning）：用大数据集（ImageNet）预训练的网络作为起点，在小数据集上微调（fine-tune）。常做法：冻结前几层只训分类头，或全部参数小学习率训练。是中小数据集的标准做法。",
        "source": "教材·深度学习", "page": 88, "url": "doc://dl#transfer",
        "meta": {"topic": "迁移学习", "difficulty": 3},
    },
    {
        "content": "数据增强（Data Augmentation）：图像可做随机裁剪、翻转、旋转、颜色抖动、Cutout、Mixup、CutMix。等价于扩充训练集，提升泛化。NLP 用同义词替换、回译、SimCSE；音频用时频掩码。",
        "source": "教材·深度学习", "page": 94, "url": "doc://dl#aug",
        "meta": {"topic": "数据增强", "difficulty": 2},
    },

    # ===== 深度学习 - RNN / LSTM =====
    {
        "content": "循环神经网络（RNN）通过隐状态 h_t = f(W·x_t + U·h_{t-1}) 处理序列数据，参数在时间维度共享。问题：长依赖时梯度消失/爆炸，难训练长序列。",
        "source": "教材·深度学习", "page": 102, "url": "doc://dl#rnn",
        "meta": {"topic": "RNN", "difficulty": 3},
    },
    {
        "content": "LSTM（Long Short-Term Memory）通过遗忘门、输入门、输出门和细胞状态 c_t 缓解 RNN 长依赖问题。细胞状态有「高速公路」性质，让梯度能跨越长距离。",
        "source": "论文·LSTM", "page": None, "url": "doi://10.1162/neco.1997.9.8.1735",
        "meta": {"topic": "LSTM", "difficulty": 4},
    },
    {
        "content": "GRU（Gated Recurrent Unit）是 LSTM 的简化版，只有两个门（更新门、重置门）和一个隐状态。参数更少，训练更快，性能接近 LSTM，常用于资源受限场景。",
        "source": "论文·GRU", "page": None, "url": "https://arxiv.org/abs/1406.1078",
        "meta": {"topic": "GRU", "difficulty": 3},
    },
    {
        "content": "双向 RNN（Bi-RNN/Bi-LSTM）同时正向和反向跑两个 RNN，把两边的隐状态拼接，能利用过去和未来的上下文。适合机器翻译、命名实体识别等离线任务，不适合实时流。",
        "source": "教材·深度学习", "page": 114, "url": "doc://dl#bi-rnn",
        "meta": {"topic": "Bi-RNN", "difficulty": 3},
    },
    {
        "content": "Seq2Seq（编码器-解码器）：Encoder 把输入序列压成上下文向量，Decoder 基于它逐步生成输出序列。机器翻译、文本摘要的基础架构。瓶颈：单个向量难承载长序列信息 → 引入注意力。",
        "source": "教材·深度学习", "page": 122, "url": "doc://dl#seq2seq",
        "meta": {"topic": "Seq2Seq", "difficulty": 3},
    },

    # ===== Transformer / Attention =====
    {
        "content": "注意力机制（Attention）让 Decoder 在生成每个 token 时，对 Encoder 所有位置加权关注，权重 = softmax(query·key)。打破固定上下文瓶颈，是 Transformer 的核心思想前身。",
        "source": "教材·深度学习", "page": 134, "url": "doc://dl#attention",
        "meta": {"topic": "Attention", "difficulty": 3},
    },
    {
        "content": "Self-Attention：序列内每个位置都和所有位置算注意力。公式 Attention(Q,K,V) = softmax(QK^T / √d_k)·V。√d_k 缩放防止 softmax 饱和。是 Transformer 的核心。",
        "source": "论文·Attention Is All You Need", "page": None, "url": "https://arxiv.org/abs/1706.03762",
        "meta": {"topic": "Self-Attention", "difficulty": 4},
    },
    {
        "content": "多头注意力（Multi-Head Attention）把 Q/K/V 投影到多个子空间并行算注意力，再拼接。让模型在不同表示子空间关注不同信息。通常 8-16 头。",
        "source": "论文·Attention Is All You Need", "page": None, "url": "https://arxiv.org/abs/1706.03762",
        "meta": {"topic": "Multi-Head", "difficulty": 4},
    },
    {
        "content": "Transformer 架构：Encoder（Self-Attention + FFN + 残差 + LayerNorm）× N，Decoder 多了 Masked Self-Attention 和 Cross-Attention。位置编码（Positional Encoding）补回序列顺序信息。",
        "source": "论文·Attention Is All You Need", "page": None, "url": "https://arxiv.org/abs/1706.03762",
        "meta": {"topic": "Transformer", "difficulty": 4},
    },
    {
        "content": "BERT（Bidirectional Encoder Representations from Transformers）：用 Transformer Encoder 做双向预训练，任务为 MLM（掩码语言模型）和 NSP（下句预测）。微调下游任务效果显著超越传统方法，开启预训练-微调范式。",
        "source": "论文·BERT", "page": None, "url": "https://arxiv.org/abs/1810.04805",
        "meta": {"topic": "BERT", "difficulty": 4},
    },
    {
        "content": "GPT 系列基于 Transformer Decoder，自回归预测下一个 token。GPT-2/3/4 通过堆参数和数据规模涌现出 in-context learning、链式推理等能力，是大语言模型的代表。",
        "source": "论文·GPT", "page": None, "url": "https://openai.com/research/gpt-4",
        "meta": {"topic": "GPT", "difficulty": 4},
    },
    {
        "content": "Layer Normalization 在每个样本的特征维度上做归一化，与 batch 无关。Transformer 用 LayerNorm 而非 BatchNorm，因序列长度可变且小 batch 训练时 BN 不稳定。",
        "source": "教材·深度学习", "page": 148, "url": "doc://dl#layernorm",
        "meta": {"topic": "LayerNorm", "difficulty": 3},
    },

    # ===== NLP 经典 =====
    {
        "content": "词袋模型（Bag of Words, BoW）把文本表示为词频向量，忽略词序。TF-IDF（Term Frequency-Inverse Document Frequency）在此基础上给罕见词加权，是经典文本特征。",
        "source": "教材·NLP", "page": 8, "url": "doc://nlp#bow",
        "meta": {"topic": "BoW/TF-IDF", "difficulty": 2},
    },
    {
        "content": "Word2Vec 用浅层网络从大语料学词向量。Skip-gram 用中心词预测上下文，CBOW 用上下文预测中心词。负采样大幅加速训练。学到的向量满足「国王 - 男 + 女 ≈ 王后」。",
        "source": "论文·Word2Vec", "page": None, "url": "https://arxiv.org/abs/1301.3781",
        "meta": {"topic": "Word2Vec", "difficulty": 3},
    },
    {
        "content": "GloVe（Global Vectors）基于全局共现矩阵分解学词向量，目标是让点积近似共现概率比。相比 Word2Vec 利用了全局统计信息。",
        "source": "论文·GloVe", "page": None, "url": "https://nlp.stanford.edu/pubs/glove.pdf",
        "meta": {"topic": "GloVe", "difficulty": 3},
    },
    {
        "content": "Subword Tokenization 把词切成子词单元，平衡词级和字级粒度，解决 OOV 问题。常见算法：BPE（Byte-Pair Encoding，GPT 系）、WordPiece（BERT 系）、SentencePiece（不依赖空格分词，适合中日韩）。",
        "source": "教材·NLP", "page": 22, "url": "doc://nlp#tokenize",
        "meta": {"topic": "Tokenization", "difficulty": 3},
    },
    {
        "content": "命名实体识别（NER, Named Entity Recognition）从文本中识别人名/地名/机构等实体。序列标注任务，常用 BIO/BIOES 标签体系。模型：CRF / Bi-LSTM-CRF / BERT-CRF。",
        "source": "教材·NLP", "page": 56, "url": "doc://nlp#ner",
        "meta": {"topic": "NER", "difficulty": 3},
    },
    {
        "content": "文本分类工作流：清洗（去 HTML/停用词/标准化）→ 分词 → 向量化（TF-IDF / Embedding）→ 模型（LogReg / SVM / FastText / 微调 BERT）→ 评估（F1 / 混淆矩阵）。",
        "source": "教材·NLP", "page": 38, "url": "doc://nlp#textcls",
        "meta": {"topic": "文本分类", "difficulty": 2},
    },

    # ===== 推荐系统 / 检索 =====
    {
        "content": "协同过滤（Collaborative Filtering）基于用户-物品交互矩阵推荐。User-based 找相似用户、Item-based 找相似物品。冷启动是经典痛点：新用户/新物品没交互。",
        "source": "教材·推荐系统", "page": 8, "url": "doc://recsys#cf",
        "meta": {"topic": "协同过滤", "difficulty": 3},
    },
    {
        "content": "矩阵分解（Matrix Factorization）把用户-物品评分矩阵 R ≈ UV^T，U 是用户向量、V 是物品向量。SVD / ALS / 隐语义模型 LFM 是经典实现，Netflix Prize 让其广为人知。",
        "source": "教材·推荐系统", "page": 18, "url": "doc://recsys#mf",
        "meta": {"topic": "矩阵分解", "difficulty": 3},
    },
    {
        "content": "双塔模型（Two-Tower）：用户塔和物品塔分别编码成向量，线上用 ANN（FAISS / Annoy / HNSW）快速召回 Top-K。是工业级深度推荐系统的标配召回方式。",
        "source": "教材·推荐系统", "page": 42, "url": "doc://recsys#two-tower",
        "meta": {"topic": "双塔模型", "difficulty": 3},
    },
    {
        "content": "向量检索（ANN, Approximate Nearest Neighbor）在高维空间快速找最近邻。HNSW（小世界图）召回率高速度快，FAISS-IVF 适合超大规模，Annoy 树法工程简单。RAG / 推荐召回 / 图像搜索都依赖它。",
        "source": "教材·推荐系统", "page": 56, "url": "doc://recsys#ann",
        "meta": {"topic": "ANN 检索", "difficulty": 4},
    },

    # ===== 强化学习 =====
    {
        "content": "强化学习（RL, Reinforcement Learning）：智能体（Agent）在环境（Environment）中通过试错学习策略，最大化累积奖励。核心要素：状态 S、动作 A、奖励 R、策略 π、值函数 V/Q。",
        "source": "教材·强化学习", "page": 4, "url": "doc://rl#intro",
        "meta": {"topic": "RL 基础", "difficulty": 3},
    },
    {
        "content": "Q-Learning：学习状态-动作值函数 Q(s,a)，用 Bellman 方程更新：Q(s,a) ← Q(s,a) + α[r + γ·max Q(s',a') - Q(s,a)]。离策略（off-policy）。Deep Q-Network（DQN）用神经网络近似 Q。",
        "source": "教材·强化学习", "page": 24, "url": "doc://rl#qlearning",
        "meta": {"topic": "Q-Learning", "difficulty": 4},
    },
    {
        "content": "策略梯度（Policy Gradient）直接对策略 π_θ 参数求导：∇J = E[∇log π_θ(a|s) · R]。REINFORCE 是最基础形式。Actor-Critic 加 Critic 减方差。PPO / TRPO 是工程常用稳定版本。",
        "source": "教材·强化学习", "page": 48, "url": "doc://rl#pg",
        "meta": {"topic": "策略梯度", "difficulty": 4},
    },
    {
        "content": "RLHF（Reinforcement Learning from Human Feedback）：先用监督微调 → 训奖励模型（人偏好对比）→ PPO 优化策略以最大化奖励。ChatGPT 等大模型对齐人类偏好的关键技术。",
        "source": "论文·InstructGPT", "page": None, "url": "https://arxiv.org/abs/2203.02155",
        "meta": {"topic": "RLHF", "difficulty": 4},
    },

    # ===== 时间序列 =====
    {
        "content": "时间序列分解：趋势（Trend）+ 季节性（Seasonality）+ 残差（Residual）。STL 是常用分解方法。分析趋势和周期能指导特征工程和模型选择。",
        "source": "教材·时间序列", "page": 8, "url": "doc://ts#decompose",
        "meta": {"topic": "TS 分解", "difficulty": 2},
    },
    {
        "content": "ARIMA（AutoRegressive Integrated Moving Average）= AR(p) + I(d) + MA(q)。d 是差分阶数让序列平稳，p 是自回归阶数，q 是移动平均阶数。短期预测经典，长期不擅长。",
        "source": "教材·时间序列", "page": 24, "url": "doc://ts#arima",
        "meta": {"topic": "ARIMA", "difficulty": 4},
    },
    {
        "content": "Prophet（Facebook 开源）把时间序列建模为 y(t) = g(t) + s(t) + h(t) + ε，分别表示趋势、季节、节假日、误差。对缺失/异常鲁棒，业务时间序列开箱即用。",
        "source": "论文·Prophet", "page": None, "url": "https://facebook.github.io/prophet/",
        "meta": {"topic": "Prophet", "difficulty": 3},
    },
    {
        "content": "时间序列做监督学习：滑动窗口（lag features）+ 时间特征（hour/day_of_week/holiday）→ 喂给 XGBoost / LSTM。注意训练-测试切分必须按时间顺序，禁止 shuffle。",
        "source": "教材·时间序列", "page": 56, "url": "doc://ts#supervised",
        "meta": {"topic": "TS 监督", "difficulty": 3},
    },

    # ===== 模型解释 =====
    {
        "content": "特征重要性：树模型自带 feature_importances_（基于分裂增益）；线性模型看系数大小（需先标准化）；通用方法 Permutation Importance（随机打乱某列看性能下降）。",
        "source": "教材·可解释性", "page": 6, "url": "doc://xai#importance",
        "meta": {"topic": "特征重要性", "difficulty": 2},
    },
    {
        "content": "SHAP（SHapley Additive exPlanations）基于博弈论 Shapley 值，给每个特征对单条预测的贡献打分。满足一致性 / 局部精确性 / 缺失性等公理，是当前最公认的解释方法。",
        "source": "论文·SHAP", "page": None, "url": "https://arxiv.org/abs/1705.07874",
        "meta": {"topic": "SHAP", "difficulty": 4},
    },
    {
        "content": "LIME（Local Interpretable Model-agnostic Explanations）：在待解释样本附近采样 + 加权拟合一个简单线性模型，用线性系数解释。模型无关、计算快，缺点是稳定性差。",
        "source": "论文·LIME", "page": None, "url": "https://arxiv.org/abs/1602.04938",
        "meta": {"topic": "LIME", "difficulty": 3},
    },
    {
        "content": "Partial Dependence Plot（PDP）固定其他特征求平均，画目标特征 vs 预测的关系曲线，看全局趋势。ICE 图保留每条样本曲线，能发现异质效应。",
        "source": "教材·可解释性", "page": 22, "url": "doc://xai#pdp",
        "meta": {"topic": "PDP/ICE", "difficulty": 3},
    },

    # ===== ML 工程实践 / MLOps =====
    {
        "content": "MLOps 把 DevOps 思路用到机器学习生命周期：数据版本（DVC）、实验跟踪（MLflow / W&B）、模型注册、CI/CD 自动训练部署、监控、AB 测试。让模型迭代可复现可追溯。",
        "source": "教材·MLOps", "page": 4, "url": "doc://mlops#intro",
        "meta": {"topic": "MLOps", "difficulty": 3},
    },
    {
        "content": "实验跟踪工具（MLflow / Weights & Biases / TensorBoard）记录每次跑的超参 / 指标 / 模型 / 代码版本，方便对比和复现。'什么时候涨的点？换了哪个超参？' 全在 UI 里。",
        "source": "教材·MLOps", "page": 12, "url": "doc://mlops#tracking",
        "meta": {"topic": "实验跟踪", "difficulty": 2},
    },
    {
        "content": "模型部署：批处理（离线打分入库）、在线服务（FastAPI / Triton / TorchServe / TF-Serving）、边缘（ONNX / TFLite / CoreML）。延迟敏感场景考虑量化（INT8）、蒸馏、模型剪枝。",
        "source": "教材·MLOps", "page": 28, "url": "doc://mlops#deploy",
        "meta": {"topic": "模型部署", "difficulty": 3},
    },
    {
        "content": "训练-服务偏差（Training-Serving Skew）：训练用的特征处理在服务时不一致（数据源不同、Pipeline 不同步、特征更新延迟）。解决：特征仓库（Feature Store）、Pipeline 复用、影子流量回归。",
        "source": "教材·MLOps", "page": 36, "url": "doc://mlops#skew",
        "meta": {"topic": "训练服务偏差", "difficulty": 4},
    },
    {
        "content": "数据漂移（Data Drift）和概念漂移（Concept Drift）：前者是输入分布 P(X) 变化，后者是 P(Y|X) 变化。监控方法：PSI / KL 散度 / Wasserstein 距离 / 模型置信度分布；触发后重训或回退。",
        "source": "教材·MLOps", "page": 44, "url": "doc://mlops#drift",
        "meta": {"topic": "数据漂移", "difficulty": 4},
    },
    {
        "content": "AB 测试：把流量分桶，对比新旧模型业务指标差异。注意样本量计算、显著性检验（t 检验/卡方/CUPED）、多重比较矫正、网络效应、长期 vs 短期指标平衡。",
        "source": "教材·MLOps", "page": 60, "url": "doc://mlops#ab",
        "meta": {"topic": "AB 测试", "difficulty": 3},
    },

    # ===== 常见陷阱 =====
    {
        "content": "数据泄漏（Data Leakage）：训练时用了测试集才能拿到的信息。典型：在划分前做标准化/缺失填充、目标编码用了全量统计、时序数据 shuffle、特征里掺了未来信息。后果是离线指标虚高、上线翻车。",
        "source": "教材·实践陷阱", "page": 4, "url": "doc://pitfalls#leakage",
        "meta": {"topic": "数据泄漏", "difficulty": 3},
    },
    {
        "content": "目标编码（Target Encoding）泄漏：直接用全量数据按类别算 Y 均值，会让模型「偷看」答案。正确做法：在 K 折 CV 内 fold 上算编码、加平滑、加随机噪声、CatBoost 那样的有序编码。",
        "source": "教材·实践陷阱", "page": 10, "url": "doc://pitfalls#target-leakage",
        "meta": {"topic": "目标编码泄漏", "difficulty": 4},
    },
    {
        "content": "时间穿越（Time Travel）：训练特征用了样本时间点之后的信息。典型：用月底统计去预测月中、用次日股价做今日特征。时间序列严格按 timestamp 切片，特征只能用样本 t 之前的数据算。",
        "source": "教材·实践陷阱", "page": 14, "url": "doc://pitfalls#time-travel",
        "meta": {"topic": "时间穿越", "difficulty": 3},
    },
    {
        "content": "幸存者偏差（Survivorship Bias）：训练数据只见到「活下来」的样本（业务还在跑的用户、未被过滤掉的样本），模型对真实分布有系统性偏差。诊断：检查数据采集逻辑、留意业务过滤条件。",
        "source": "教材·实践陷阱", "page": 18, "url": "doc://pitfalls#survivorship",
        "meta": {"topic": "幸存者偏差", "difficulty": 3},
    },
    {
        "content": "为什么准确率不能作为不平衡问题的指标：极端例 99% 负 1% 正，模型全预测负即得 99% 准确率，但毫无价值。改用 F1 / PR-AUC / 召回（关心正样本时）/ 业务相关指标。",
        "source": "教材·实践陷阱", "page": 22, "url": "doc://pitfalls#imbalance-metric",
        "meta": {"topic": "不平衡指标", "difficulty": 2},
    },
    {
        "content": "为什么分类任务不用 MSE 而用交叉熵：MSE 在 sigmoid 输出端梯度小（饱和区导数趋零），训练慢；交叉熵的梯度是 (ŷ-y) 形式，与误差大小线性相关，收敛快。这是 sigmoid + CE 标配的来源。",
        "source": "教材·实践陷阱", "page": 28, "url": "doc://pitfalls#mse-vs-ce",
        "meta": {"topic": "MSE vs CE", "difficulty": 3},
    },
    {
        "content": "为什么标准化要在划分之后做：在划分前对整个数据集 fit_transform 会用到测试集统计 → 泄漏。正确做法：StandardScaler 在训练集 fit，对验证/测试集仅 transform。sklearn Pipeline 自动避免。",
        "source": "教材·实践陷阱", "page": 32, "url": "doc://pitfalls#scaling",
        "meta": {"topic": "标准化时机", "difficulty": 2},
    },
    {
        "content": "为什么有时 K=1 的 KNN 训练误差为零但测试很差：K=1 完全记忆训练点，过拟合到噪声。K 越大模型越平滑，偏差升、方差降。K 是经典偏差-方差权衡控制旋钮。",
        "source": "教材·实践陷阱", "page": 36, "url": "doc://pitfalls#knn-k",
        "meta": {"topic": "KNN K 选择", "difficulty": 2},
    },

    # ===== sklearn / PyTorch 实操 =====
    {
        "content": "sklearn Pipeline 把预处理和模型串成单一对象，调 fit / predict 自动按顺序跑。避免数据泄漏、代码整洁、可直接喂 GridSearchCV。ColumnTransformer 处理不同列用不同变换。",
        "source": "scikit-learn 文档", "page": None, "url": "https://scikit-learn.org/stable/modules/compose.html",
        "meta": {"topic": "sklearn Pipeline", "difficulty": 2},
    },
    {
        "content": "GridSearchCV 在指定超参网格上做 K 折交叉验证选最优。RandomizedSearchCV 用随机采样，相同时间能探索更多超参组合，大网格更高效。HalvingGridSearchCV 用逐层淘汰更快。",
        "source": "scikit-learn 文档", "page": None, "url": "https://scikit-learn.org/stable/modules/grid_search.html",
        "meta": {"topic": "超参搜索", "difficulty": 3},
    },
    {
        "content": "贝叶斯优化（Bayesian Optimization）建模超参→指标的代理函数（高斯过程 / TPE），有策略地选下一个尝试点。比网格/随机更高效，但实现复杂。常用库：Optuna / Hyperopt / scikit-optimize。",
        "source": "教材·超参优化", "page": 24, "url": "doc://hpo#bo",
        "meta": {"topic": "贝叶斯优化", "difficulty": 4},
    },
    {
        "content": "PyTorch 训练循环骨架：for epoch → for batch in dataloader → optimizer.zero_grad() → loss = criterion(model(x), y) → loss.backward() → optimizer.step()。验证模式 model.eval() + torch.no_grad() 关 Dropout/BN。",
        "source": "PyTorch 文档", "page": None, "url": "https://pytorch.org/tutorials/",
        "meta": {"topic": "PyTorch 训练", "difficulty": 2},
    },
    {
        "content": "PyTorch autograd：tensor 设置 requires_grad=True，前向自动建计算图，loss.backward() 反向算梯度填到 tensor.grad。detach() / with torch.no_grad() 可阻断梯度。",
        "source": "PyTorch 文档", "page": None, "url": "https://pytorch.org/tutorials/beginner/blitz/autograd_tutorial.html",
        "meta": {"topic": "autograd", "difficulty": 3},
    },
    {
        "content": "DataLoader 把 Dataset 包装成可迭代 batch 流，支持 num_workers 多进程加载、pin_memory 加速 GPU 传输、shuffle / drop_last。自定义 collate_fn 处理变长样本。",
        "source": "PyTorch 文档", "page": None, "url": "https://pytorch.org/docs/stable/data.html",
        "meta": {"topic": "DataLoader", "difficulty": 2},
    },

    # ===== 概率统计 / 信息论补充 =====
    {
        "content": "贝叶斯定理 P(H|E) = P(E|H)·P(H)/P(E)。先验 × 似然 / 证据 = 后验。是贝叶斯推断的基石，朴素贝叶斯分类器、贝叶斯网络、贝叶斯优化的核心。",
        "source": "教材·概率统计基础", "page": 4, "url": "doc://stats#bayes",
        "meta": {"topic": "贝叶斯定理", "difficulty": 2},
    },
    {
        "content": "中心极限定理：独立同分布随机变量的均值，当样本量 n→∞ 时趋于正态分布。是 t 检验 / 置信区间 / 大数定律工程应用的理论基础。",
        "source": "教材·概率统计基础", "page": 36, "url": "doc://stats#clt",
        "meta": {"topic": "CLT", "difficulty": 2},
    },
    {
        "content": "假设检验：原假设 H0 / 备择假设 H1 / 显著性水平 α（常 0.05）/ p 值（在 H0 下观测到此结果或更极端的概率）。p < α 拒绝 H0。注意 p 值不是 H0 为真的概率。",
        "source": "教材·概率统计基础", "page": 48, "url": "doc://stats#hypothesis",
        "meta": {"topic": "假设检验", "difficulty": 3},
    },
    {
        "content": "I 类错误（α，假阳）vs II 类错误（β，假阴）。检验力 = 1-β。样本量、效应大小、α、β 四者中固定三个可求第四个。AB 测试样本量计算用此公式。",
        "source": "教材·概率统计基础", "page": 56, "url": "doc://stats#error-types",
        "meta": {"topic": "I/II 类错误", "difficulty": 3},
    },
    {
        "content": "熵 H(X) = -Σ p(x) log p(x) 衡量随机变量的不确定性。条件熵 H(Y|X) 给定 X 后 Y 的剩余不确定性。互信息 I(X;Y) = H(Y) - H(Y|X) 表示 X 提供给 Y 的信息量，是决策树特征选择的依据。",
        "source": "教材·信息论", "page": 4, "url": "doc://info#entropy",
        "meta": {"topic": "熵 / 互信息", "difficulty": 3},
    },

    # ===== 生成模型 =====
    {
        "content": "生成模型（Generative Model）学习数据分布 P(X) 或 P(X,Y)，能采样生成新样本。判别模型学 P(Y|X)。代表：GAN / VAE / 自回归模型 / 扩散模型。",
        "source": "教材·生成模型", "page": 4, "url": "doc://gen#intro",
        "meta": {"topic": "生成模型概念", "difficulty": 3},
    },
    {
        "content": "GAN（生成对抗网络）：生成器 G 造假样本骗判别器 D，D 学着分真假。极小极大博弈 min_G max_D V(D,G)，纳什均衡时 G 学到真实分布。训练不稳定是经典痛点。",
        "source": "论文·GAN", "page": None, "url": "https://arxiv.org/abs/1406.2661",
        "meta": {"topic": "GAN", "difficulty": 4},
    },
    {
        "content": "VAE（变分自编码器）：编码器 q(z|x) 输出隐变量分布参数（均值 / 方差），解码器 p(x|z) 重建。损失 = 重建误差 + KL(q‖标准正态)。生成多样性好但样本糊。",
        "source": "论文·VAE", "page": None, "url": "https://arxiv.org/abs/1312.6114",
        "meta": {"topic": "VAE", "difficulty": 4},
    },
    {
        "content": "扩散模型（Diffusion）：前向过程逐步加噪到纯噪声，反向过程学去噪。Stable Diffusion / DALL-E 2 等图像生成 SOTA。比 GAN 训练稳定、样本质量高，缺点是采样慢。",
        "source": "论文·DDPM", "page": None, "url": "https://arxiv.org/abs/2006.11239",
        "meta": {"topic": "扩散模型", "difficulty": 4},
    },

    # ===== 大模型 / Prompt =====
    {
        "content": "In-Context Learning：大模型仅凭 prompt 中的少量示例（few-shot）就能完成新任务，无需参数更新。GPT-3 论文最早系统展示，是大模型涌现能力之一。",
        "source": "论文·GPT-3", "page": None, "url": "https://arxiv.org/abs/2005.14165",
        "meta": {"topic": "ICL", "difficulty": 3},
    },
    {
        "content": "Chain-of-Thought（CoT）让大模型在 prompt 里「想清楚再回答」。简单加一句 「Let's think step by step」 就能显著提升数学/推理任务正确率。",
        "source": "论文·CoT", "page": None, "url": "https://arxiv.org/abs/2201.11903",
        "meta": {"topic": "CoT", "difficulty": 3},
    },
    {
        "content": "RAG（Retrieval-Augmented Generation）：检索相关文档作为上下文 + 大模型生成。比纯 LLM 减少幻觉、可追溯引用、知识可热更新。因材智训的工作台就是 RAG + 多 Agent。",
        "source": "论文·RAG", "page": None, "url": "https://arxiv.org/abs/2005.11401",
        "meta": {"topic": "RAG", "difficulty": 3},
    },
    {
        "content": "Prompt Engineering 技巧：角色设定（你是 X）、结构化输入输出（JSON schema / Markdown）、few-shot 例子、思维链、分步骤、约束格式、温度参数。系统 prompt 比 user prompt 优先级高。",
        "source": "教材·大模型实践", "page": 8, "url": "doc://llm#prompt",
        "meta": {"topic": "Prompt 工程", "difficulty": 2},
    },
    {
        "content": "LoRA（Low-Rank Adaptation）冻结大模型主参数，只在每层加低秩矩阵 B·A 微调。参数量降到 0.1%，显存友好、可插拔多任务适配器，是大模型微调的主流方法。",
        "source": "论文·LoRA", "page": None, "url": "https://arxiv.org/abs/2106.09685",
        "meta": {"topic": "LoRA", "difficulty": 4},
    },
    {
        "content": "大模型幻觉（Hallucination）：编造事实/引用/代码。缓解：RAG 引入外部知识、约束 prompt、温度低、思维链让模型自查、引用真实来源、人工/模型审核兜底。",
        "source": "教材·大模型实践", "page": 24, "url": "doc://llm#hallucination",
        "meta": {"topic": "幻觉问题", "difficulty": 3},
    },

    # ===== 集成 / Bagging vs Boosting =====
    {
        "content": "Bagging（Bootstrap Aggregating）：对训练集有放回采样训多个基学习器，并行训练、投票/平均。降方差为主，对偏差影响小。Random Forest 是 Bagging + 随机特征子集的代表。",
        "source": "教材·集成学习", "page": 152, "url": "doc://ensemble#bagging",
        "meta": {"topic": "Bagging", "difficulty": 3},
    },
    {
        "content": "Boosting：串行训练，每个新学习器拟合前面集成的残差或错样本权重。降偏差为主，但容易过拟合。AdaBoost / GBDT / XGBoost / LightGBM / CatBoost 都是 Boosting 家族。",
        "source": "教材·集成学习", "page": 165, "url": "doc://ensemble#boosting",
        "meta": {"topic": "Boosting", "difficulty": 3},
    },
    {
        "content": "Stacking（堆叠）：用基学习器的输出作为新特征，喂给次级学习器（meta-learner）。需要严格防泄漏：基学习器对训练集做 out-of-fold 预测、对测试集用全量训练后预测。Kaggle 比赛常用提分。",
        "source": "教材·集成学习", "page": 180, "url": "doc://ensemble#stacking",
        "meta": {"topic": "Stacking", "difficulty": 4},
    },
    {
        "content": "XGBoost：Newton 提升（用二阶导数）、正则项、缺失值自动处理、列采样、shrinkage、并行直方图算法。竞赛和工业界长盛不衰，处理结构化数据的强 baseline。",
        "source": "论文·XGBoost", "page": None, "url": "https://arxiv.org/abs/1603.02754",
        "meta": {"topic": "XGBoost", "difficulty": 4},
    },
    {
        "content": "LightGBM 相比 XGBoost：直方图分箱更省内存、Leaf-wise 增长比 Level-wise 更快收敛、GOSS（梯度单边采样）和 EFB（特征捆绑）针对大数据/高维做了优化。Microsoft 出品。",
        "source": "论文·LightGBM", "page": None, "url": "https://papers.nips.cc/paper/6907-lightgbm-a-highly-efficient-gradient-boosting-decision-tree",
        "meta": {"topic": "LightGBM", "difficulty": 4},
    },
    {
        "content": "CatBoost 专攻类别特征：有序目标编码避免泄漏、对称树训练快、API 直接吃 string 列。Yandex 出品，类别多的数据上常优于 LGB/XGB。",
        "source": "论文·CatBoost", "page": None, "url": "https://arxiv.org/abs/1706.09516",
        "meta": {"topic": "CatBoost", "difficulty": 3},
    },

    # ===== 工程实践小贴士 =====
    {
        "content": "训练慢怎么排查：profile 看 CPU/GPU 利用率、I/O 是否瓶颈（dataloader workers/pin_memory）、模型是否真在 GPU、batch_size 能否再大、混合精度（AMP）、梯度累积模拟大 batch、检查 .item() 之类同步操作。",
        "source": "教材·工程实践", "page": 4, "url": "doc://practice#training-speed",
        "meta": {"topic": "训练加速", "difficulty": 3},
    },
    {
        "content": "显存爆怎么办：减小 batch_size、用梯度累积、混合精度（FP16）、梯度检查点（gradient checkpointing 用计算换显存）、模型并行、ZeRO 优化器状态分片、LoRA 仅训低秩矩阵。",
        "source": "教材·工程实践", "page": 10, "url": "doc://practice#oom",
        "meta": {"topic": "OOM 处理", "difficulty": 3},
    },
    {
        "content": "训练 loss NaN 排查：学习率太大 → 调小或 warmup；梯度爆炸 → clip；混合精度溢出 → 用 GradScaler / FP32；输入有 nan / inf → 数据清洗；log(0) → 加 epsilon；除以可能为 0 的量 → 加 epsilon。",
        "source": "教材·工程实践", "page": 16, "url": "doc://practice#nan",
        "meta": {"topic": "NaN 排查", "difficulty": 3},
    },
    {
        "content": "模型不收敛排查：检查标签是否对应、loss 是否实现正确、单 batch 能否过拟合（小数据试跑）、学习率是否合适（用 lr finder）、初始化是否合理、归一化是否一致、数据是否被错误 shuffle。",
        "source": "教材·工程实践", "page": 22, "url": "doc://practice#noncongerge",
        "meta": {"topic": "不收敛排查", "difficulty": 3},
    },
    {
        "content": "可复现性：固定 random_seed（torch / numpy / random / cuda）、设置 cudnn.deterministic=True、记录 lib 版本、保存数据划分、保存模型权重和优化器状态。深度学习完全位级复现很难，常 ε 级近似。",
        "source": "教材·工程实践", "page": 28, "url": "doc://practice#repro",
        "meta": {"topic": "可复现", "difficulty": 3},
    },
    {
        "content": "模型上线 checklist：离线指标达标 → 线上影子流量（不影响用户）→ 小流量 AB → 全量。监控：QPS / 延迟 / 错误率 / 业务指标 / 数据漂移。回滚预案、版本管理、报警阈值不能少。",
        "source": "教材·工程实践", "page": 34, "url": "doc://practice#online",
        "meta": {"topic": "上线流程", "difficulty": 3},
    },

    # ===== 业务场景案例 =====
    {
        "content": "金融风控：建模目标是预测违约/欺诈概率。特征：用户画像 / 交易历史 / 设备指纹 / 关联图谱。难点是不平衡（正样本 1‰）、概念漂移、对抗性、可解释（监管要求）。常用 GBDT + 规则。",
        "source": "教材·业务案例", "page": 4, "url": "doc://case#risk",
        "meta": {"topic": "风控场景", "difficulty": 3},
    },
    {
        "content": "广告 CTR 预估：预测用户点击概率。海量稀疏特征（用户ID / 物品ID / 上下文），早期 LR + 人工交叉、后期 Wide & Deep / DeepFM / DIN / DIEN。指标用 AUC + LogLoss + 线上 CTR 提升。",
        "source": "教材·业务案例", "page": 18, "url": "doc://case#ctr",
        "meta": {"topic": "CTR 场景", "difficulty": 4},
    },
    {
        "content": "异常检测：监督有标签时用分类；无标签用 Isolation Forest / One-Class SVM / Autoencoder 重建误差 / 高斯分布偏离。工业设备故障、信用卡欺诈、网络入侵的核心技术。",
        "source": "教材·业务案例", "page": 32, "url": "doc://case#anomaly",
        "meta": {"topic": "异常检测", "difficulty": 3},
    },
    {
        "content": "搜索相关性：query-doc 双塔召回 → BM25 / GBDT / Cross-Encoder 排序 → 业务规则重排。指标：MRR / NDCG / 召回率。难点是 query 多样化、长尾、用户反馈隐式。",
        "source": "教材·业务案例", "page": 44, "url": "doc://case#search",
        "meta": {"topic": "搜索相关性", "difficulty": 4},
    },

    # ===== 数学补充 =====
    {
        "content": "雅可比矩阵（Jacobian）是多元函数所有一阶偏导组成的矩阵。海森矩阵（Hessian）是二阶偏导。一阶优化只用梯度，二阶（牛顿法）用 Hessian 收敛更快但计算和存储贵。",
        "source": "教材·数学基础", "page": 8, "url": "doc://math#jacobian",
        "meta": {"topic": "Jacobian/Hessian", "difficulty": 3},
    },
    {
        "content": "凸函数（Convex）：任意两点连线在函数图像之上。凸优化的局部最优 = 全局最优。线性回归 / 逻辑回归 / SVM 是凸的，神经网络不是，所以 NN 训练只能找局部最优。",
        "source": "教材·数学基础", "page": 14, "url": "doc://math#convex",
        "meta": {"topic": "凸性", "difficulty": 3},
    },
    {
        "content": "范数：L0 非零元素个数（NP 难）、L1 绝对值和（稀疏）、L2 欧氏（平滑）、L∞ 最大绝对值。机器学习里 L1/L2 最常用，前者做特征选择、后者抗共线性。",
        "source": "教材·数学基础", "page": 22, "url": "doc://math#norm",
        "meta": {"topic": "范数", "difficulty": 2},
    },
    {
        "content": "特征分解 Ax = λx：A 把方向 x 缩放 λ 倍而不旋转，x 是特征向量，λ 是特征值。对称矩阵特征向量正交。PCA / 谱聚类 / PageRank 都基于特征分解。",
        "source": "教材·数学基础", "page": 30, "url": "doc://math#eigen",
        "meta": {"topic": "特征分解", "difficulty": 3},
    },
    {
        "content": "奇异值分解 SVD：A = UΣV^T，对任意矩阵都成立。Σ 对角线是奇异值（从大到小）。截断 SVD 取前 k 个奇异值实现降维 / 压缩。推荐系统的矩阵分解、LSA 都基于 SVD。",
        "source": "教材·数学基础", "page": 38, "url": "doc://math#svd",
        "meta": {"topic": "SVD", "difficulty": 3},
    },
    {
        "content": "拉格朗日乘子法解约束优化：min f(x) s.t. g(x)=0 → 构造 L(x,λ) = f - λg，对 x 和 λ 求偏导置零。带不等式约束用 KKT 条件，SVM 推导的核心工具。",
        "source": "教材·数学基础", "page": 48, "url": "doc://math#lagrange",
        "meta": {"topic": "拉格朗日", "difficulty": 4},
    },

    # ===== 模型选择 =====
    {
        "content": "选模型的实用法则：数据少→简单模型（LR / 朴素贝叶斯）；表格结构化数据→XGBoost / LightGBM；图像→CNN / 预训练；文本→Transformer / 预训练；时序短期→ARIMA / Prophet；长期复杂→LSTM / Transformer。",
        "source": "教材·模型选择", "page": 4, "url": "doc://model-choice#guideline",
        "meta": {"topic": "模型选择指南", "difficulty": 2},
    },
    {
        "content": "Occam 剃刀：在效果相近时优先选简单模型。简单 = 更容易解释 / 上线 / 维护 / 调参；复杂模型只在简单方案明显失效或业务允许大成本时考虑。",
        "source": "教材·模型选择", "page": 8, "url": "doc://model-choice#occam",
        "meta": {"topic": "Occam 剃刀", "difficulty": 1},
    },
    {
        "content": "No Free Lunch 定理：没有任一算法在所有问题上都最优。所以模型选型必须结合数据特点（量级、类型、噪声、分布），而非「哪个最强用哪个」。",
        "source": "教材·模型选择", "page": 14, "url": "doc://model-choice#nfl",
        "meta": {"topic": "NFL 定理", "difficulty": 2},
    },

    # ===== Python ML 生态速览 =====
    {
        "content": "Python ML 生态分工：NumPy 数值数组 / pandas 表格 / matplotlib + seaborn 可视化 / scikit-learn 传统 ML / PyTorch + TensorFlow 深度学习 / XGBoost LightGBM 树模型 / Hugging Face transformers 预训练模型 / FAISS 向量检索。",
        "source": "教材·Python ML", "page": 4, "url": "doc://pyml#ecosystem",
        "meta": {"topic": "Python 生态", "difficulty": 1},
    },
    {
        "content": "pandas 常用：read_csv 读数 / df.info()/describe() 速览 / df.isna().sum() 看缺失 / groupby+agg 聚合 / merge 关联 / pivot_table 透视 / apply 自定义。groupby + transform 保持长表结构常被忽视。",
        "source": "pandas 文档", "page": None, "url": "https://pandas.pydata.org/docs/",
        "meta": {"topic": "pandas 速查", "difficulty": 2},
    },
    {
        "content": "NumPy 广播（Broadcasting）让不同形状的数组按规则对齐做元素级运算。常用：(N,1) 列向量和 (1,M) 行向量相加得 (N,M)。能避免显式循环大幅加速。",
        "source": "NumPy 文档", "page": None, "url": "https://numpy.org/doc/stable/user/basics.broadcasting.html",
        "meta": {"topic": "广播", "difficulty": 2},
    },

    # ===== StudyMate 系统设计相关 =====
    {
        "content": "RAG 系统设计要点：文档切块（chunk size 200-500 字 + overlap 50）、embedding 模型选型（中文常用 bge / m3e）、向量检索（FAISS / Chroma / Milvus）、Top-K 召回 + 重排（cross-encoder）、Prompt 拼接、引用追溯。",
        "source": "教材·RAG 工程", "page": 4, "url": "doc://rag#design",
        "meta": {"topic": "RAG 设计", "difficulty": 3},
    },
    {
        "content": "多 Agent 协同范式：LangGraph / AutoGen / CrewAI 等框架。常见 pattern：Manager 拆任务 → 多 Agent 并行执行 → 结果聚合。状态共享、错误恢复、可观测性是工程难点。",
        "source": "教材·Agent 工程", "page": 4, "url": "doc://agent#multi",
        "meta": {"topic": "多 Agent", "difficulty": 3},
    },
    {
        "content": "学习者画像建模：知识基础（数学/编程/统计）、认知风格（视觉/听觉/动手）、学习目标、薄弱点、节奏、资源偏好。多维度合并存 JSON，配合版本化历史，便于自适应推荐。",
        "source": "教材·教育智能", "page": 8, "url": "doc://edu#profile",
        "meta": {"topic": "学习者画像", "difficulty": 2},
    },
    {
        "content": "自适应学习路径：基于学习者画像和当前进度，动态选择下一个最适合的知识点和资源。常用方法：知识图谱推理、IRT（项目反应理论）、强化学习选题、规则引擎。",
        "source": "教材·教育智能", "page": 14, "url": "doc://edu#adaptive",
        "meta": {"topic": "自适应路径", "difficulty": 3},
    },
    {
        "content": "AI 生成内容标识合规：根据《生成式人工智能服务管理暂行办法》，AI 生成的文本/图片需显式标识「AI 生成」，可追溯到模型版本和生成时间。落地常做法：水印、UI 标签、API 响应字段、日志。",
        "source": "法规·生成式 AI", "page": None, "url": "https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm",
        "meta": {"topic": "AI 标识合规", "difficulty": 2},
    },
    {
        "content": "教育 AI 评估闭环：学习者学 → 答题 → 评估正确率 / 行为 → 更新画像 → 调整下次推荐难度和资源。因材智训的 EvalAgent + ProfileSnapshot + apply-delta 实现的就是这个闭环。",
        "source": "教材·教育智能", "page": 28, "url": "doc://edu#loop",
        "meta": {"topic": "评估闭环", "difficulty": 3},
    },
]


async def main():
    # Windows 控制台 GBK，强制 stdout 用 UTF-8
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    svc = get_rag_service()
    await svc.clear_all()
    res = await svc.ingest(course_name="机器学习", items=CHUNKS)
    print(f"[OK] ingested {res['ingested']} chunks, total={res['total']}")

    test_queries = ["什么是梯度下降", "PCA 怎么做降维", "过拟合怎么解决"]
    for q in test_queries:
        hits = await svc.search(q, k=3)
        print(f"\nquery: {q}")
        for i, h in enumerate(hits, 1):
            print(f"  [{i}] score={h['score']} src={h['source']} page={h['page']}")
            print(f"      {h['content'][:80]}...")


if __name__ == "__main__":
    asyncio.run(main())
