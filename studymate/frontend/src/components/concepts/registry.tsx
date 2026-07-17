/**
 * 概念动画注册表
 * ------------------------------------------------------------------
 * 每个旗舰概念 → 一个自包含动画组件 + 元信息。
 * matchKeywords 供后续「工作台详情页主题命中时自动冒出动画」用。
 */
import type { ComponentType, LazyExoticComponent } from "react"
import {
  GradientDescentAnim,
  KnnAnim,
  LinearRegressionAnim,
  DecisionTreeAnim,
  LogisticRegressionAnim,
  SvmAnim,
  PerceptronAnim,
  NaiveBayesAnim,
  ForwardPropAnim,
  BackpropAnim,
  ConvAnim,
  ActivationAnim,
  AttentionAnim,
  QuicksortAnim,
  MergeSortAnim,
  BstAnim,
  TcpHandshakeAnim,
  DeadlockAnim,
  PipelineAnim,
  KMeansAnim,
  OverfittingAnim,
  OptimizerCompareAnim,
  RegularizationAnim,
  DijkstraAnim,
  SchedulingAnim,
  CongestionAnim,
  CacheAnim,
  PcaAnim,
  RocAucAnim,
  DbscanAnim,
  BiasVarianceAnim,
  RandomForestAnim,
  AdaBoostAnim,
  GmmAnim,
  KFoldAnim,
  SoftmaxAnim,
  ConfusionMatrixAnim,
  PoolingAnim,
  DropoutAnim,
  RnnAnim,
  GbdtAnim,
  VanishingGradientAnim,
  BatchNormAnim,
  LearningCurveAnim,
  DpKnapsackAnim,
  HashTableAnim,
  BinarySearchAnim,
  HeapAnim,
  GraphTraversalAnim,
  BigOAnim,
  DynamicArrayAnim,
  LinkedListAnim,
  StackAnim,
  CircularQueueAnim,
  BasicSortsAnim,
  HeapSortAnim,
  TreeTraversalAnim,
  AvlTreeAnim,
  RedBlackTreeAnim,
  KmpAnim,
  UnionFindAnim,
  TopologicalSortAnim,
  MstAnim,
  NQueensAnim,
  LstmAnim,
  TransformerAnim,
  QLearningAnim,
  GanAnim,
  Word2VecAnim,
  KernelTrickAnim,
  LossFunctionsAnim,
  HierarchicalAnim,
  ResNetAnim,
  AutoencoderAnim,
  SvdAnim,
  MleAnim,
  EntropyAnim,
  MarkovChainAnim,
  FeatureScalingAnim,
  CollaborativeFilteringAnim,
  HmmAnim,
  TfidfAnim,
  DiffusionAnim,
  VaeAnim,
  LdaAnim,
  GnnAnim,
  EarlyStoppingAnim,
  WeightInitAnim,
  PrCurveAnim,
  PositionalEncodingAnim,
} from "./lazyConceptComponents"
import { SCRIPTED_COURSE_ANIMS } from "./scripted/scriptedCourseRegistry"

/** 讲课模式注入给动画的可选 props（ConceptPlayer 通过 cloneElement 注入）。
 *  lecture=true 时动画放慢自动步进、自动播放；每步把当前字幕通过 onCaption 回传给外壳朗读。 */
export interface ConceptAnimProps {
  lecture?: boolean
  /** 旧协议：动画连续自播，每步把字幕喊给外壳朗读（不等念完）。 */
  onCaption?: (text: string) => void
  /** 新协议（分步讲课）：外壳显示大字幕 + 朗读，「念完」后 resolve；动画 await 它再推进下一拍 → 音画同步。 */
  narrate?: (text: string) => Promise<void>
  /** 讲课开场调用一次，把全部节拍文字传进来一次性预合成语音 → 播放时拍间零等待、连贯不卡。 */
  prepareNarration?: (texts: string[]) => Promise<void>
  /** 该值改变即从头重讲（「再讲一遍」用）。 */
  replayNonce?: number
  /** 讲课全部节拍播完时调用（外壳据此显示「再讲一遍」）。 */
  onLectureEnd?: () => void
}

export interface ConceptAnim {
  key: string
  title: string
  course: string
  /** 课程徽章配色（tailwind 类） */
  badgeClass: string
  /** 主题命中关键词（工作台 topic 含任一即可推荐该动画） */
  matchKeywords: string[]
  /** 动画库里的一句话文字说明（不朗读，纯文字让用户自己看） */
  blurb: string
  /** 是否已支持「讲课模式」（语音老师逐步讲）；未接的不显示开关，避免死按钮 */
  lectureReady?: boolean
  /** DOM 渲染的动画（非 canvas，如流水线/Cache 表格）：用外壳 CSS PanZoom 缩放（矢量清晰）；
   *  canvas 动画则各自内置「真·视口」、不套 PanZoom。默认 false=canvas 原生视口。 */
  cssZoom?: boolean
  component: ComponentType<ConceptAnimProps> | LazyExoticComponent<ComponentType<ConceptAnimProps>>
}

const COURSE_BADGE_CLASS: Record<string, string> = {
  机器学习: "border border-[#C8D1D8] bg-[#E7EDF3] text-[#315E83]",
  数据结构与算法: "border border-[#CFD8CA] bg-[#E9EEE6] text-[#557052]",
  操作系统: "border border-[#DFC8BE] bg-[#F4E8E2] text-[#9A4E35]",
  计算机网络: "border border-[#C8D1D8] bg-[#E7EDF3] text-[#315E83]",
  计算机组成原理: "border border-[#D9CFB7] bg-[#F4ECD8] text-[#8E6925]",
}

export const CONCEPT_ANIMS: ConceptAnim[] = [
  {
    key: "gradient-descent",
    title: "梯度下降 Gradient Descent",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["梯度下降", "gradient descent", "学习率", "sgd", "优化器", "损失函数"],
    blurb: "沿损失曲面负梯度一步步滚向谷底；拖动学习率 η 看收敛、临界震荡与发散。",
    lectureReady: true,
    component: GradientDescentAnim,
  },
  {
    key: "kmeans",
    title: "K-Means 聚类",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["kmeans", "k-means", "聚类", "质心", "簇", "无监督"],
    blurb: "「分配-更新」两步交替：点归到最近质心，质心移到簇中心，循环到稳定不再变。",
    lectureReady: true,
    component: KMeansAnim,
  },
  {
    key: "overfitting",
    title: "过拟合 / 欠拟合 Overfitting",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["过拟合", "欠拟合", "overfitting", "underfitting", "泛化", "偏差", "方差", "bias", "variance", "模型复杂度"],
    blurb: "拖多项式次数 d：太小欠拟合、太大过拟合；训练误差单调降、测试误差呈 U 形——泛化权衡一图看懂。",
    lectureReady: true,
    component: OverfittingAnim,
  },
  {
    key: "optimizer-compare",
    title: "优化器对比 SGD / Momentum / Adam",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["优化器", "optimizer", "momentum", "动量", "adam", "rmsprop", "sgd 对比", "自适应学习率", "收敛速度"],
    blurb: "三个球同起点下同一狭长损失谷：SGD 震荡慢、Momentum 借惯性、Adam 逐维自适应——一眼看懂优化器差异。",
    lectureReady: true,
    component: OptimizerCompareAnim,
  },
  {
    key: "regularization",
    title: "L1 / L2 正则化",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["正则", "正则化", "regularization", "l1", "l2", "lasso", "ridge", "岭回归", "稀疏", "权重衰减", "weight decay", "特征选择"],
    blurb: "损失椭圆 + 约束区（L2 圆 / L1 菱形）：拖 λ 看 L2 等比缩小、L1 尖角命中坐标轴把权重压成 0（稀疏）。",
    lectureReady: true,
    component: RegularizationAnim,
  },
  {
    key: "knn",
    title: "K 近邻 KNN",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["knn", "k近邻", "k 近邻", "近邻", "最近邻", "nearest neighbor"],
    blurb: "给「?」找最近的 K 个邻居投票，多数类即预测类；拖 K 滑块看结果怎么变。",
    lectureReady: true,
    component: KnnAnim,
  },
  {
    key: "linear-regression",
    title: "线性回归 Linear Regression",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["线性回归", "linear regression", "回归", "最小二乘", "拟合直线", "残差"],
    blurb: "梯度下降调斜率 w 和截距 b，让所有残差的平方和(MSE)最小，直线贴合数据。",
    lectureReady: true,
    component: LinearRegressionAnim,
  },
  {
    key: "decision-tree",
    title: "决策树 Decision Tree",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["决策树", "decision tree", "分类树", "基尼", "gini", "信息增益", "划分"],
    blurb: "逐层提问把平面切成纯色盒子：每次按基尼最优挑一条轴对齐划分线，递归到每块基本一类。",
    lectureReady: true,
    component: DecisionTreeAnim,
  },
  {
    key: "logistic-regression",
    title: "逻辑回归 Logistic Regression",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["逻辑回归", "logistic regression", "logistic", "sigmoid", "对数几率", "二分类", "交叉熵"],
    blurb: "用 sigmoid 把 w·x+b 压成概率，梯度下降调边界让交叉熵最小；背景色就是预测概率。",
    lectureReady: true,
    component: LogisticRegressionAnim,
  },
  {
    key: "svm",
    title: "支持向量机 SVM",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["svm", "支持向量机", "支持向量", "最大间隔", "间隔", "support vector", "合页", "hinge"],
    blurb: "不光分对，还要让分隔线离两类最远——最大化间隔；落在间隔上的支持向量决定这条线。",
    lectureReady: true,
    component: SvmAnim,
  },
  {
    key: "perceptron",
    title: "感知机 Perceptron",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["感知机", "perceptron", "感知器", "神经元", "线性可分", "w += "],
    blurb: "神经网络的鼻祖：每遇到一个分错的点就把分隔线朝纠正它的方向推一下，线性可分必收敛。",
    lectureReady: true,
    component: PerceptronAnim,
  },
  {
    key: "naive-bayes",
    title: "朴素贝叶斯 Naive Bayes",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["朴素贝叶斯", "naive bayes", "贝叶斯", "bayes", "先验", "后验", "似然", "条件概率"],
    blurb: "对每类拟合高斯分布，用「后验 ∝ 先验 × 似然」给待分类点算各类概率，谁大归谁。",
    lectureReady: true,
    component: NaiveBayesAnim,
  },
  {
    key: "forward-prop",
    title: "神经网络前向传播 Forward",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["前向传播", "forward", "神经网络", "neural network", "mlp", "多层感知机", "全连接"],
    blurb: "数据从左到右逐层流动：每个神经元做「加权求和 z=Σw·a+b」再过激活函数 σ，算出激活值。",
    lectureReady: true,
    component: ForwardPropAnim,
  },
  {
    key: "backprop",
    title: "反向传播 Backpropagation",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["反向传播", "backprop", "backpropagation", "bp", "链式法则", "梯度回传", "训练神经网络"],
    blurb: "前向→算损失→反向回传梯度 δ→按 w←w-η·∂L/∂w 更新；每轮 loss 真实下降，这就是训练。",
    lectureReady: true,
    component: BackpropAnim,
  },
  {
    key: "cnn-conv",
    title: "CNN 卷积 Convolution",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["卷积", "cnn", "convolution", "卷积核", "kernel", "特征图", "感受野", "卷积神经网络"],
    blurb: "卷积核在输入图上滑动，每处把盖住的 3×3 区域与核逐元素相乘求和→输出特征图，提取局部特征。",
    lectureReady: true,
    component: ConvAnim,
  },
  {
    key: "activation",
    title: "激活函数 Activation",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["激活函数", "activation", "relu", "sigmoid", "tanh", "leaky", "梯度消失", "非线性"],
    blurb: "ReLU/Sigmoid/Tanh/LeakyReLU 曲线 + 导数：看两端饱和导致梯度消失、ReLU 正半轴梯度恒为 1。",
    lectureReady: true,
    component: ActivationAnim,
  },
  {
    key: "attention",
    title: "自注意力 Attention",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["注意力", "attention", "self-attention", "自注意力", "transformer", "qkv", "query key value"],
    blurb: "每个词作 Query 和所有词的 Key 点积→softmax 成注意力权重，输出是 Value 加权和——Transformer 核心。",
    lectureReady: true,
    component: AttentionAnim,
  },
  {
    key: "pca",
    title: "主成分分析 PCA",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["pca", "主成分", "主成分分析", "降维", "principal component", "特征值", "协方差", "方差最大"],
    blurb: "求协方差矩阵特征向量：转一圈找投影方差最大的方向 = PC1，把点投影到它上面即「二维→一维」降维。",
    lectureReady: true,
    component: PcaAnim,
  },
  {
    key: "roc-auc",
    title: "ROC 曲线与 AUC",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["roc", "auc", "roc曲线", "auc面积", "真正率", "假正率", "tpr", "fpr", "阈值", "模型评估"],
    blurb: "阈值从高扫到低：正样本→TPR 上台阶、负样本→FPR 右台阶，描出 ROC 曲线，曲线下面积 = AUC。",
    lectureReady: true,
    component: RocAucAnim,
  },
  {
    key: "dbscan",
    title: "DBSCAN 密度聚类",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["dbscan", "密度聚类", "核心点", "噪声", "离群", "聚类", "eps", "minpts", "任意形状"],
    blurb: "按密度聚类：ε 内邻居≥minPts 即核心点，从核心点 BFS 向外蔓延成簇，够不到的点判为噪声——不用预设 K。",
    lectureReady: true,
    component: DbscanAnim,
  },
  {
    key: "random-forest",
    title: "随机森林 Random Forest",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["随机森林", "random forest", "集成学习", "bagging", "决策树", "投票", "ensemble", "装袋"],
    blurb: "多棵 bootstrap 抽样的决策树投票：单棵树边界生硬易过拟合，多棵差异树一平均 → 边界平滑稳健（bagging 降方差）。",
    lectureReady: true,
    component: RandomForestAnim,
  },
  {
    key: "adaboost",
    title: "AdaBoost 提升",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["adaboost", "提升", "boosting", "集成学习", "弱分类器", "树桩", "stump", "加权", "ensemble"],
    blurb: "串行训练弱树桩：每轮把分错的点权重调大，下一个树桩重点照顾，按 α 加权投票叠成强分界（boosting 串行纠错）。",
    lectureReady: true,
    component: AdaBoostAnim,
  },
  {
    key: "bias-variance",
    title: "偏差-方差权衡",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["偏差", "方差", "bias", "variance", "偏差方差", "权衡", "tradeoff", "欠拟合", "过拟合", "泛化"],
    blurb: "对多份重采样各拟合一遍：拟合彼此散开=方差、均值线偏离真曲线=偏差。拖复杂度 d 看「简单→偏差大、复杂→方差大」。",
    lectureReady: true,
    component: BiasVarianceAnim,
  },
  {
    key: "gmm",
    title: "高斯混合 GMM / EM",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["gmm", "高斯混合", "em", "em算法", "软聚类", "混合模型", "期望最大", "gaussian mixture", "聚类"],
    blurb: "EM 交替：E 步算每点属各成分的软概率(混色)、M 步更新高斯的中心/协方差(椭圆)。比 K-Means 能拟合椭圆 + 软分配。",
    lectureReady: true,
    component: GmmAnim,
  },
  {
    key: "k-fold",
    title: "K 折交叉验证",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["交叉验证", "k折", "k-fold", "cross validation", "验证集", "模型评估", "调参", "泛化"],
    blurb: "数据均分 K 份，每份轮流当验证集、其余训练，测 K 个准确率再平均。比单次划分更稳、更可靠地评估模型。",
    lectureReady: true,
    component: KFoldAnim,
  },
  {
    key: "softmax",
    title: "Softmax 归一化",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["softmax", "归一化指数", "多分类", "概率", "logits", "温度", "输出层", "one-hot"],
    blurb: "把 logits 取指数再归一化成和为 1 的概率：pᵢ=e^(zᵢ/T)/Σe^(zⱼ/T)。温度 T 小→集中(硬)、大→拉平(软)。",
    lectureReady: true,
    component: SoftmaxAnim,
  },
  {
    key: "confusion-matrix",
    title: "混淆矩阵 Confusion Matrix",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["混淆矩阵", "confusion matrix", "查准率", "查全率", "精确率", "召回率", "precision", "recall", "f1", "tp", "fp", "fn", "tn", "准确率", "模型评估", "评价指标"],
    blurb: "把真实与预测交叉数成 2×2：TP/FP/FN/TN，由它算出准确率/查准率/查全率/F1。拖阈值看查准↔查全此消彼长。",
    lectureReady: true,
    component: ConfusionMatrixAnim,
  },
  {
    key: "pooling",
    title: "池化 Pooling",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["池化", "pooling", "最大池化", "平均池化", "max pooling", "average pooling", "下采样", "降采样", "subsampling", "cnn", "平移不变"],
    blurb: "2×2 窗口步长 2 滑过特征图，每窗取最大（或平均）→ 尺寸减半、计算量降 ¼；最大池化保留最强响应带来平移不变性。",
    lectureReady: true,
    component: PoolingAnim,
  },
  {
    key: "dropout",
    title: "Dropout 随机失活",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["dropout", "随机失活", "正则化", "过拟合", "失活", "drop out", "神经网络正则", "防过拟合"],
    blurb: "训练时每个隐藏神经元按概率 p 随机关掉，每批换一套「瘦身网络」→ 逼网络别依赖个别神经元（防过拟合）；推理时全开、权重×(1-p)。",
    lectureReady: true,
    component: DropoutAnim,
  },
  {
    key: "rnn",
    title: "循环神经网络 RNN",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["rnn", "循环神经网络", "recurrent", "序列模型", "时间步", "隐藏状态", "lstm", "gru", "时序", "序列"],
    blurb: "按时间步逐个处理序列，隐藏状态 h 当「记忆」沿时间轴传递，每步复用同一套权重（参数共享）；末步 h 浓缩整条序列。",
    lectureReady: true,
    component: RnnAnim,
  },
  {
    key: "gbdt",
    title: "梯度提升树 GBDT",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["gbdt", "梯度提升", "gradient boosting", "提升树", "xgboost", "lightgbm", "残差", "boosting", "集成学习"],
    blurb: "多棵回归树串行相加，每棵只拟合上一轮的残差；预测曲线逐棵贴合数据、RMSE 下降。区别于随机森林并行投票、AdaBoost 调样本权重。",
    lectureReady: true,
    component: GbdtAnim,
  },
  {
    key: "vanishing-gradient",
    title: "梯度消失 Vanishing Gradient",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["梯度消失", "vanishing gradient", "梯度爆炸", "梯度弥散", "深层网络", "链式法则", "sigmoid 饱和", "relu", "残差连接"],
    blurb: "反传时梯度是沿途各层「激活导数×权重」的连乘：Sigmoid 导数≤0.25 → 指数衰减、浅层≈0；换 ReLU 导数=1 梯度原样穿过。",
    lectureReady: true,
    component: VanishingGradientAnim,
  },
  {
    key: "batch-norm",
    title: "批归一化 BatchNorm",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["批归一化", "batch normalization", "batchnorm", "bn", "归一化", "标准化", "内部协变量偏移", "层归一化", "layernorm"],
    blurb: "对一批激活算 μ/σ 标准化成均值0方差1，再用可学习 γβ 缩放平移；稳住每层输入分布 → 可用更大学习率、训练更快更稳。",
    lectureReady: true,
    component: BatchNormAnim,
  },
  {
    key: "learning-curve",
    title: "学习曲线 Learning Curve",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["学习曲线", "learning curve", "训练曲线", "样本数", "诊断", "欠拟合", "过拟合", "高偏差", "高方差", "训练验证误差"],
    blurb: "训练/验证误差随训练样本数变化的两条曲线：差距持续大=过拟合(高方差)，都高且贴近=欠拟合(高偏差)。切简单/复杂模型看两种形态。",
    lectureReady: true,
    component: LearningCurveAnim,
  },
  {
    key: "lstm",
    title: "长短期记忆网络 LSTM",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["lstm", "长短期记忆", "门控", "遗忘门", "输入门", "输出门", "细胞状态", "gru", "long short term", "序列"],
    blurb: "RNN 加细胞状态传送带 c + 三个门(遗忘/输入/输出)：c'=f·c+i·g, h'=o·tanh(c')。逐步看门控与记忆更新，解决长依赖。",
    lectureReady: true,
    component: LstmAnim,
  },
  {
    key: "transformer",
    title: "Transformer 架构",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["transformer", "变形金刚", "多头注意力", "multi-head", "自注意力", "bert", "gpt", "大模型", "位置编码", "encoder", "ffn"],
    blurb: "编码器块：输入嵌入+位置编码 → 多头自注意力 → Add&Norm → FFN → Add&Norm。右侧为真实计算的 2 头注意力热力图。大模型基石。",
    lectureReady: true,
    component: TransformerAnim,
  },
  {
    key: "q-learning",
    title: "强化学习 Q-learning",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["强化学习", "q-learning", "qlearning", "reinforcement", "智能体", "agent", "奖励", "bellman", "马尔可夫决策", "策略", "q表"],
    blurb: "格子世界智能体试错：Q(s,a)←Q+α[r+γ·maxQ'−Q]，奖励从终点回传。训练若干回合后每格箭头收敛成通往终点、避开陷阱的最优策略。",
    lectureReady: true,
    component: QLearningAnim,
  },
  {
    key: "gan",
    title: "生成对抗网络 GAN",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["gan", "生成对抗", "生成对抗网络", "生成器", "判别器", "对抗训练", "generative adversarial", "生成模型", "纳什均衡"],
    blurb: "生成器(造假)与判别器(辨真假)对抗：真实 1D 训练，生成分布逐步逼近真实、判别器处处趋近 0.5 分不清 → 纳什均衡。图像生成基础。",
    lectureReady: true,
    component: GanAnim,
  },
  {
    key: "word2vec",
    title: "词嵌入 Word2Vec",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["词嵌入", "word2vec", "词向量", "embedding", "glove", "skip-gram", "cbow", "nlp", "语义向量", "词向量空间"],
    blurb: "每个词→一个向量：语义近则距离近(找最近邻)；方向有含义——国王−男人+女人≈王后(真实向量加减)。NLP 把词变向量的基石。",
    lectureReady: true,
    component: Word2VecAnim,
  },
  {
    key: "kernel-trick",
    title: "核技巧 Kernel Trick",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["核技巧", "kernel", "核函数", "kernel trick", "升维", "rbf", "高斯核", "多项式核", "线性不可分", "svm 核"],
    blurb: "低维线性不可分 → 升维变可分：φ(x)=(x,x²) 把直线上的点抬到抛物线，一条直线即分开。核函数=不算高维坐标直接算高维内积。",
    lectureReady: true,
    component: KernelTrickAnim,
  },
  {
    key: "loss-functions",
    title: "损失函数对比",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["损失函数", "loss function", "mse", "mae", "huber", "交叉熵", "cross entropy", "hinge", "合页损失", "目标函数", "代价函数"],
    blurb: "回归：MSE(对离群点敏感)/MAE(稳健)/Huber(折中)；分类：交叉熵(罚错得自信)/合页(SVM)。切换看不同损失「在乎什么」。",
    lectureReady: true,
    component: LossFunctionsAnim,
  },
  {
    key: "hierarchical",
    title: "层次聚类 Hierarchical",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["层次聚类", "hierarchical clustering", "凝聚", "树状图", "dendrogram", "agglomerative", "聚类", "连接", "linkage"],
    blurb: "自底向上反复合并最近两簇，建树状图(dendrogram)；不用预设簇数，横切一刀即得任意簇数。补全聚类家族。",
    lectureReady: true,
    component: HierarchicalAnim,
  },
  {
    key: "resnet",
    title: "残差连接 ResNet",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["残差", "resnet", "残差连接", "残差网络", "skip connection", "跳跃连接", "退化问题", "恒等映射", "deep residual"],
    blurb: "退化问题：朴素深网信号逐层衰减。残差连接给每块加捷径 y=F(x)+x，即使 F→0 输入也原样穿过 → 信号/梯度不衰减，可训极深网络。",
    lectureReady: true,
    component: ResNetAnim,
  },
  {
    key: "autoencoder",
    title: "自编码器 Autoencoder",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["自编码器", "autoencoder", "编码器", "解码器", "瓶颈", "重建", "降维", "去噪", "表示学习", "vae", "无监督"],
    blurb: "先压缩再还原：编码器把 12 维压成 2 维 code，解码器重建回 12 维；重建≈输入说明 2 个数即抓住本质。降维/去噪/异常检测/VAE 基础。",
    lectureReady: true,
    component: AutoencoderAnim,
  },
  {
    key: "svd",
    title: "奇异值分解 SVD",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["svd", "奇异值分解", "奇异值", "singular value", "矩阵分解", "低秩近似", "降维", "图像压缩", "u σ v"],
    blurb: "把矩阵拆成一串「秩 1 块」σᵣ·uᵣvᵣᵀ，σ 从大到小；只留前 k 个最大奇异值即最佳 k 秩近似——逐步加 k 看图从模糊变清晰、误差与压缩比实时算。",
    lectureReady: true,
    component: SvdAnim,
  },
  {
    key: "mle",
    title: "最大似然估计 MLE",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["最大似然", "mle", "maximum likelihood", "似然", "likelihood", "似然函数", "参数估计", "极大似然"],
    blurb: "「哪个参数让这堆数据最可能出现？」扫描候选 μ，对数似然在样本均值处最大 = MLE。最小二乘/交叉熵本质都是它。",
    lectureReady: true,
    component: MleAnim,
  },
  {
    key: "entropy",
    title: "信息熵 / 交叉熵 / KL 散度",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["信息熵", "熵", "entropy", "交叉熵", "cross entropy", "kl散度", "kl divergence", "相对熵", "信息量", "信息论"],
    blurb: "熵 H=−Σp·log₂p 衡量不确定性：均匀分布最大、越确定越接近 0。交叉熵/KL=用错的分布 q 编码真实 p 多付的比特。",
    lectureReady: true,
    component: EntropyAnim,
  },
  {
    key: "markov-chain",
    title: "马尔可夫链 Markov Chain",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["马尔可夫", "马尔可夫链", "markov", "markov chain", "转移矩阵", "平稳分布", "状态转移", "无记忆", "pagerank"],
    blurb: "下一步只取决于当前(无记忆)。分布反复乘转移矩阵 πₜ₊₁=πₜP，收敛到与初始无关的平稳分布。PageRank/MCMC 基础。",
    lectureReady: true,
    component: MarkovChainAnim,
  },
  {
    key: "feature-scaling",
    title: "特征缩放 标准化/归一化",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["特征缩放", "标准化", "归一化", "normalization", "standardization", "feature scaling", "z-score", "min-max", "数据预处理", "量纲"],
    blurb: "量纲悬殊的特征把损失等高线拉成扁长山谷、梯度下降锯齿绕行；标准化(x−μ)/σ 后变圆碗、几步收敛。KNN/SVM/NN 都需要。",
    lectureReady: true,
    component: FeatureScalingAnim,
  },
  {
    key: "collaborative-filtering",
    title: "协同过滤 / 推荐系统",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["协同过滤", "推荐系统", "collaborative filtering", "recommendation", "推荐算法", "矩阵分解", "matrix factorization", "评分预测", "相似度"],
    blurb: "用「和你口味最像的人」预测你没看过的评分：在共同评分上算相似度，再按相似度加权平均。现代用矩阵分解。",
    lectureReady: true,
    component: CollaborativeFilteringAnim,
  },
  {
    key: "hmm",
    title: "隐马尔可夫模型 HMM",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["隐马尔可夫", "hmm", "hidden markov", "维特比", "viterbi", "隐状态", "观测序列", "发射概率", "序列标注", "前向算法"],
    blurb: "由观测反推看不见的隐状态序列。维特比逐列填「最可能路径概率」、记下来路，末列回溯得最优隐藏序列。语音识别/词性标注核心。",
    lectureReady: true,
    component: HmmAnim,
  },
  {
    key: "tf-idf",
    title: "TF-IDF",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["tf-idf", "tfidf", "词频", "逆文档频率", "idf", "关键词提取", "文本特征", "文本表示", "信息检索", "停用词"],
    blurb: "TF(词频) × IDF(逆文档频率) = 关键词权重：出现得多又别处少见的词权重最高；处处都有的词(如停用词)IDF=0、权重为 0。",
    lectureReady: true,
    component: TfidfAnim,
  },
  {
    key: "diffusion",
    title: "扩散模型 Diffusion",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["扩散模型", "diffusion", "ddpm", "stable diffusion", "去噪", "加噪", "生成模型", "denoising", "扩散", "文生图"],
    blurb: "前向一步步给数据加高斯噪声直到变纯噪声；模型学会反过来一步步去噪，从噪声生成新样本。Stable Diffusion/DALL·E 的底层。",
    lectureReady: true,
    component: DiffusionAnim,
  },
  {
    key: "vae",
    title: "变分自编码器 VAE",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["vae", "变分自编码器", "variational autoencoder", "重参数化", "reparameterization", "潜空间", "latent", "kl", "生成模型", "隐变量"],
    blurb: "编码成分布(μ,σ)而非点 + 重参数化 z=μ+σε + KL 把后验拉向 N(0,I) → 潜空间连续可生成。采 z 解码即得新样本、可插值。",
    lectureReady: true,
    component: VaeAnim,
  },
  {
    key: "lda",
    title: "线性判别分析 LDA",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["lda", "线性判别", "线性判别分析", "linear discriminant", "fisher", "费舍尔", "判别分析", "有监督降维", "类间", "类内"],
    blurb: "有监督降维：找让两类投影后分得最开的方向。转一圈算 Fisher 准则 (m₁−m₂)²/(s₁²+s₂²)，最大处即最佳判别方向。对比 PCA(无监督)。",
    lectureReady: true,
    component: LdaAnim,
  },
  {
    key: "gnn",
    title: "图神经网络 GNN / GCN",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["图神经网络", "gnn", "gcn", "graph neural network", "消息传递", "message passing", "图卷积", "节点分类", "图嵌入", "图数据"],
    blurb: "图上做半监督节点分类：每个节点反复聚合邻居特征更新自己(消息传递)，标签信息沿边扩散，节点被染成所属社区。卷积是其网格特例。",
    lectureReady: true,
    component: GnnAnim,
  },
  {
    key: "early-stopping",
    title: "早停 Early Stopping",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["早停", "early stopping", "提前停止", "验证误差", "过拟合", "正则化", "训练技巧", "validation"],
    blurb: "训练误差一路降、验证误差先降后升(回升=过拟合)。早停=盯住验证误差，到最低点就停、保留那一刻的模型。最省事的正则化。",
    lectureReady: true,
    component: EarlyStoppingAnim,
  },
  {
    key: "weight-init",
    title: "权重初始化 Xavier / He",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["权重初始化", "初始化", "xavier", "he", "glorot", "weight initialization", "梯度消失", "梯度爆炸", "方差", "kaiming"],
    blurb: "太小→激活逐层衰减为0(消失)、太大→冲进饱和区(爆炸)；Xavier 让权重方差=1/输入维度、每层方差稳定。He 版取 2/n 配 ReLU。",
    lectureReady: true,
    component: WeightInitAnim,
  },
  {
    key: "pr-curve",
    title: "PR 曲线 Precision-Recall",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["pr曲线", "pr curve", "precision recall", "查准率查全率", "ap", "average precision", "平均精度", "模型评估", "不平衡"],
    blurb: "阈值从高扫到低：查全率单调升、查准率震荡降，描出 PR 曲线，曲线下面积=AP。正负极不平衡时比 ROC 更能反映真实表现。",
    lectureReady: true,
    component: PrCurveAnim,
  },
  {
    key: "positional-encoding",
    title: "位置编码 Positional Encoding",
    course: "机器学习",
    badgeClass: "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300",
    matchKeywords: ["位置编码", "positional encoding", "position embedding", "正弦编码", "sinusoidal", "transformer", "位置信息", "词序", "相对位置"],
    blurb: "自注意力分不清词序；位置编码用不同频率的 sin/cos 给每个位置一个独特指纹加到词向量上。靠前维度频率高、靠后频率低。",
    lectureReady: true,
    component: PositionalEncodingAnim,
  },
  {
    key: "big-o",
    title: "时间复杂度 Big-O",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["时间复杂度", "空间复杂度", "复杂度", "big o", "big-o", "bigo", "渐近复杂度", "渐近记号", "算法效率", "o(1)", "o(log n)", "o(n)", "o(n log n)", "o(n²)"],
    blurb: "让 n 逐步增大，真实计算 O(1)、O(log n)、O(n)、O(n log n)、O(n²) 的增长量级，直观看懂为什么规模一大差距会爆开。",
    lectureReady: true,
    component: BigOAnim,
  },
  {
    key: "dynamic-array",
    title: "数组与动态扩容 Dynamic Array",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["数组", "动态数组", "dynamic array", "顺序表", "顺序存储", "数组扩容", "动态扩容", "capacity", "vector", "arraylist", "array list"],
    blurb: "连续内存支持 O(1) 下标访问；容量装满时申请更大的数组并逐项复制，观察一次 O(n) 扩容如何摊还成追加 O(1)。",
    lectureReady: true,
    component: DynamicArrayAnim,
  },
  {
    key: "linked-list",
    title: "单链表 Linked List",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["链表", "单链表", "linked list", "singly linked list", "链式存储", "头插法", "尾插法", "链表插入", "链表删除", "链表反转", "reverse linked list"],
    blurb: "节点靠 next 指针串联；切换插入、删除与反转，逐步看指针先保存再改向，避免断链。",
    lectureReady: true,
    component: LinkedListAnim,
  },
  {
    key: "stack",
    title: "栈 Stack",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["栈", "stack", "入栈", "出栈", "push", "pop", "调用栈", "递归栈", "后进先出", "lifo"],
    blurb: "元素只从栈顶进出：push 压入、pop 弹出；用调用帧同步演示函数为何总是后调用先返回。",
    lectureReady: true,
    component: StackAnim,
  },
  {
    key: "circular-queue",
    title: "队列 / 循环队列 Queue",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["队列", "循环队列", "queue", "circular queue", "入队", "出队", "enqueue", "dequeue", "front", "rear", "先进先出", "fifo", "环形缓冲"],
    blurb: "front 出队、rear 入队，并用模运算绕回数组开头复用空位；逐拍看队空、队满与指针环绕。",
    lectureReady: true,
    component: CircularQueueAnim,
  },
  {
    key: "basic-sorts",
    title: "冒泡 / 选择 / 插入排序",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["冒泡排序", "bubble sort", "bubblesort", "选择排序", "selection sort", "插入排序", "insertion sort", "直接插入排序", "基础排序", "简单排序", "排序算法"],
    blurb: "同一组数据切换三种 O(n²) 基础排序：冒泡交换相邻逆序、选择每轮找最小、插入维护有序前缀，并真实统计比较与交换。",
    lectureReady: true,
    component: BasicSortsAnim,
  },
  {
    key: "quicksort",
    title: "快速排序 Quicksort",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["快速排序", "快排", "quick sort", "quicksort", "分区", "partition", "pivot"],
    blurb: "选基准 pivot 做 Lomuto 分区，小的甩左、大的甩右，再对两边递归到整体有序。",
    lectureReady: true,
    component: QuicksortAnim,
  },
  {
    key: "merge-sort",
    title: "归并排序 Merge Sort",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["归并排序", "合并排序", "归并", "merge sort", "mergesort", "分治", "二路归并"],
    blurb: "自顶向下二分到底，再两两归并：比较左右子区间队首，小的先落位，合成有序。",
    lectureReady: true,
    component: MergeSortAnim,
  },
  {
    key: "heap-sort",
    title: "堆排序 Heap Sort",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["堆排序", "heap sort", "heapsort", "建堆", "heapify", "原地排序", "取堆顶", "下沉排序"],
    blurb: "先自底向上建最大堆，再反复把堆顶最大值换到末尾并下沉修复；真实走完 O(n log n) 的原地排序。",
    lectureReady: true,
    component: HeapSortAnim,
  },
  {
    key: "binary-search",
    title: "二分查找 Binary Search",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["二分查找", "binary search", "binarysearch", "二分", "折半查找", "折半", "有序数组查找", "logn"],
    blurb: "有序数组里每步看中间元素，按大小砍掉一半范围，lo/hi 逼近 → O(log n)。前提：数组有序。",
    lectureReady: true,
    component: BinarySearchAnim,
  },
  {
    key: "tree-traversal",
    title: "二叉树遍历 Tree Traversal",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["二叉树遍历", "树遍历", "tree traversal", "前序遍历", "先序遍历", "preorder", "中序遍历", "inorder", "后序遍历", "postorder", "层序遍历", "level order"],
    blurb: "切换前序、中序、后序和层序，逐节点高亮访问顺序，并同步展示递归栈或 BFS 队列的变化。",
    lectureReady: true,
    component: TreeTraversalAnim,
  },
  {
    key: "bst",
    title: "二叉搜索树 BST",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["二叉搜索树", "二叉排序树", "二叉查找树", "binary search tree", "bst", "搜索树", "查找树", "bst插入", "bst查找"],
    blurb: "插入时从根比较：小往左、大往右，走到空位挂上；左子树<根<右子树，中序即升序。",
    lectureReady: true,
    component: BstAnim,
  },
  {
    key: "avl-tree",
    title: "AVL 平衡二叉树",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["avl", "avl树", "平衡二叉树", "平衡搜索树", "平衡因子", "左旋", "右旋", "ll旋转", "rr旋转", "lr旋转", "rl旋转"],
    blurb: "插入后沿祖先回溯计算平衡因子，切换 LL、RR、LR、RL 四类失衡，逐步看单旋或双旋恢复 |BF|≤1。",
    lectureReady: true,
    component: AvlTreeAnim,
  },
  {
    key: "red-black-tree",
    title: "红黑树 Red-Black Tree",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["红黑树", "red black tree", "red-black tree", "rbtree", "rb tree", "红黑树插入", "插入修复", "红黑树旋转", "叔节点", "重新染色"],
    blurb: "新节点按 BST 插入并染红，再依据父、叔、祖父的颜色进行变色和旋转，维持根黑、红不相邻与黑高一致。",
    lectureReady: true,
    component: RedBlackTreeAnim,
  },
  {
    key: "heap",
    title: "堆 / 二叉堆 Heap",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["堆", "二叉堆", "heap", "最大堆", "大顶堆", "大根堆", "最小堆", "小顶堆", "小根堆", "优先队列", "priority queue", "上浮", "sift up", "sift down"],
    blurb: "完全二叉树+数组存(孩子=2i+1/2i+2)，最大堆父≥孩子；插入放末尾再上浮。树+数组对照，取顶 O(1)、增删 O(log n)。",
    lectureReady: true,
    component: HeapAnim,
  },
  {
    key: "hash-table",
    title: "哈希表 Hash Table",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["哈希表", "hash table", "hash map", "hashmap", "散列", "散列表", "哈希", "hash", "冲突", "链地址法", "拉链法", "哈希函数", "开放定址"],
    blurb: "h(k)=k mod m 把键直接映射到桶 → O(1) 存取；冲突用链地址法挂链表。逐键插入看哈希计算与冲突挂链。",
    lectureReady: true,
    component: HashTableAnim,
  },
  {
    key: "kmp",
    title: "KMP 字符串匹配",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["kmp", "字符串匹配", "模式匹配", "string matching", "前缀函数", "prefix function", "next数组", "失配回退", "部分匹配表", "最长相等前后缀", "lps"],
    blurb: "先真实构造模式串的前缀函数，再在失配时把 j 回退到最长可复用前缀，主串指针不回头，整体 O(n+m)。",
    lectureReady: true,
    component: KmpAnim,
  },
  {
    key: "union-find",
    title: "并查集 Union-Find",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["并查集", "union find", "union-find", "disjoint set", "dsu", "路径压缩", "path compression", "按秩合并", "按大小合并", "连通性"],
    blurb: "用森林维护连通分量：union 按秩把矮树挂到高树，find 沿途把节点直接接到根，路径压缩后操作近乎 O(1)。",
    lectureReady: true,
    component: UnionFindAnim,
  },
  {
    key: "graph-traversal",
    title: "图遍历 BFS / DFS",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["图遍历", "bfs", "dfs", "广度优先", "广搜", "宽搜", "深度优先", "深搜", "breadth first", "breadth-first search", "depth first", "depth-first search", "队列遍历", "栈遍历", "图搜索"],
    blurb: "从起点系统访问全图：BFS 用队列层层扩散(无权最短路)，DFS 用栈一路到底(连通/拓扑/回溯)。可切两种看顺序差异。",
    lectureReady: true,
    component: GraphTraversalAnim,
  },
  {
    key: "topological-sort",
    title: "拓扑排序 Topological Sort",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["拓扑排序", "topological sort", "toposort", "kahn", "入度", "有向无环图", "dag", "先修关系", "依赖排序"],
    blurb: "Kahn 算法反复取出入度为 0 的节点、删除出边并让后继入队；若最终取不完所有节点，图中就存在环。",
    lectureReady: true,
    component: TopologicalSortAnim,
  },
  {
    key: "mst",
    title: "最小生成树 Prim / Kruskal",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["最小生成树", "minimum spanning tree", "mst", "prim", "kruskal", "克鲁斯卡尔", "普里姆", "割性质", "生成树"],
    blurb: "同一张带权无向图切换 Prim 与 Kruskal：一个从点集向外长，一个按边权配合并查集选边，最终得到相同最小总权。",
    lectureReady: true,
    component: MstAnim,
  },
  {
    key: "dijkstra",
    title: "Dijkstra 最短路",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["dijkstra", "最短路", "最短路径", "松弛", "单源最短路", "单源最短路径", "迪杰斯特拉"],
    blurb: "每次取当前最近的未访问点，不断「松弛」它的邻边，求非负权图中单源到各点的最短路。",
    lectureReady: true,
    component: DijkstraAnim,
  },
  {
    key: "dp-knapsack",
    title: "动态规划 · 0/1 背包",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["动态规划", "dp", "dynamic programming", "背包", "knapsack", "0/1背包", "0-1背包", "01背包", "最优子结构", "状态转移", "记忆化"],
    blurb: "0/1 背包填表：dp[i][c]=max(不拿=正上方, 拿=左上方+价值)；逐格填到右下角即最大价值。DP=拆子问题+存表复用。",
    lectureReady: true,
    component: DpKnapsackAnim,
  },
  {
    key: "n-queens",
    title: "回溯算法 · N 皇后",
    course: "数据结构与算法",
    badgeClass: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    matchKeywords: ["n皇后", "n queens", "n-queens", "八皇后", "8皇后", "皇后问题", "回溯", "回溯算法", "backtracking", "剪枝", "约束搜索"],
    blurb: "逐行尝试放皇后；列或对角线冲突就剪枝，无路可走便撤销上一步，真实回溯直到找到一组合法解。",
    lectureReady: true,
    component: NQueensAnim,
  },
  {
    key: "tcp-handshake",
    title: "TCP 三次握手",
    course: "计算机网络",
    badgeClass: "bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300",
    matchKeywords: ["三次握手", "tcp", "握手", "syn", "建立连接", "handshake"],
    blurb: "SYN → SYN-ACK → ACK 三次握手，双方互相确认收发能力后才建立连接。",
    lectureReady: true,
    component: TcpHandshakeAnim,
  },
  {
    key: "congestion",
    title: "TCP 拥塞控制",
    course: "计算机网络",
    badgeClass: "bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300",
    matchKeywords: ["拥塞控制", "拥塞", "cwnd", "慢启动", "拥塞避免", "congestion", "ssthresh"],
    blurb: "cwnd 慢启动里指数涨、拥塞避免里线性涨，一丢包就骤降——Tahoe 锯齿曲线。",
    lectureReady: true,
    component: CongestionAnim,
  },
  {
    key: "deadlock",
    title: "死锁 Deadlock",
    course: "操作系统",
    badgeClass: "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300",
    matchKeywords: ["死锁", "deadlock", "资源分配", "环形等待", "哲学家", "互斥"],
    blurb: "进程互相占有并等待对方的资源，形成环形等待，谁也走不了——死锁四条件直观看。",
    lectureReady: true,
    component: DeadlockAnim,
  },
  {
    key: "scheduling-rr",
    title: "进程调度 时间片轮转",
    course: "操作系统",
    badgeClass: "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300",
    matchKeywords: ["进程调度", "时间片", "轮转", "round robin", "rr", "甘特", "调度算法"],
    blurb: "时间片轮转：每个进程轮流跑一个时间片，到点就换下一个，甘特图逐拍看调度。",
    lectureReady: true,
    component: SchedulingAnim,
  },
  {
    key: "pipeline",
    title: "5 级流水线 Pipeline",
    course: "计算机组成原理",
    badgeClass: "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300",
    matchKeywords: ["流水线", "pipeline", "冒险", "hazard", "bubble", "停顿", "吞吐"],
    blurb: "取指/译码/执行/访存/写回五段重叠流水；遇数据冒险用 bubble 停顿化解。",
    cssZoom: true,
    lectureReady: true,
    component: PipelineAnim,
  },
  {
    key: "cache-direct",
    title: "Cache 直接映射",
    course: "计算机组成原理",
    badgeClass: "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300",
    matchKeywords: ["cache", "缓存", "直接映射", "命中", "缺失", "tag", "映射"],
    blurb: "内存块按「块号 % 行数」映射到唯一 Cache 行，比对 tag 判命中还是缺失。",
    cssZoom: true,
    lectureReady: true,
    component: CacheAnim,
  },
  ...SCRIPTED_COURSE_ANIMS,
]

// 课程徽章统一沿用暖纸张色系，避免早期蓝紫与暗色类名混入播放页。
for (const concept of CONCEPT_ANIMS) {
  concept.badgeClass = COURSE_BADGE_CLASS[concept.course] ?? "border border-[#D5CED8] bg-[#EEE9EF] text-[#756579]"
}

/**
 * 搜索文本归一化：
 * - 英文统一小写；连字符、斜杠等标点折成空格，兼容 quick-sort / quick sort。
 * - 中文保留原样，仍可在自然问句中做短语命中。
 */
function normalizeConceptText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2010-\u2015_./\\]+/g, " ")
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
}

function hasCjk(value: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(value)
}

/** 英文缩写/单词必须按 token 命中，避免 `ap` 抢中 `hashmap` 这类误匹配。 */
function containsConceptTerm(text: string, term: string): boolean {
  if (!text || !term) return false
  if (hasCjk(term)) return text.includes(term)

  let from = 0
  while (from <= text.length - term.length) {
    const at = text.indexOf(term, from)
    if (at < 0) return false
    const before = at > 0 ? text[at - 1] : ""
    const after = at + term.length < text.length ? text[at + term.length] : ""
    const asciiWord = (ch: string) => /[a-z0-9]/.test(ch)
    if (!asciiWord(before) && !asciiWord(after)) return true
    from = at + 1
  }
  return false
}

function termScore(query: string, rawTerm: string): number {
  const term = normalizeConceptText(rawTerm)
  const directMatch = containsConceptTerm(query, term)
  const compactQuery = query.replace(/\s/g, "")
  const compactTerm = term.replace(/\s/g, "")
  const compactExact = compactQuery === compactTerm
  // 兼容 HTTP2 / 8021Q / CSMACD / TCP滑动窗口 等常见紧凑写法。
  // 非完全匹配至少要求 4 个字符，并继续约束纯 ASCII 词边界，避免短缩写误命中。
  const compactContains = compactTerm.length >= 4 && compactQuery.includes(compactTerm)
  const compactBoundaryMatch = (() => {
    if (!compactContains || hasCjk(compactTerm)) return compactContains
    const at = compactQuery.indexOf(compactTerm)
    const before = at > 0 ? compactQuery[at - 1] : ""
    const after = at + compactTerm.length < compactQuery.length ? compactQuery[at + compactTerm.length] : ""
    const asciiWord = (ch: string) => /[a-z0-9]/.test(ch)
    return !asciiWord(before) && !asciiWord(after)
  })()
  if (!directMatch && !compactExact && !compactBoundaryMatch) return 0
  const compactLength = compactTerm.length
  const exactBonus = query === term || compactExact ? 2_000 : 0
  const phraseBonus = term.includes(" ") ? 30 : 0
  const compactPenalty = directMatch ? 0 : 10
  return exactBonus + compactLength * 20 + phraseBonus - compactPenalty
}

/**
 * 概念相关度。多个关键词同时命中会累加，因此“动态规划 状态转移”会优先命中
 * 同时拥有两组词的 DP，而不是只含“状态转移”的其它概念。
 */
export function conceptMatchScore(concept: ConceptAnim, query: string, includeDescription = false): number {
  const normalized = normalizeConceptText(query)
  if (!normalized) return 0

  const terms = [concept.title, ...concept.matchKeywords]
  let score = terms.reduce((sum, term) => sum + termScore(normalized, term), 0)

  if (includeDescription) {
    score += termScore(normalized, concept.course)
    // 动画库输入框需要支持逐字输入（例如“快速”也能看到“快速排序”）。
    const allowPartial = hasCjk(normalized) || normalized.replace(/\s/g, "").length >= 2
    if (allowPartial) {
      const fields = [concept.title, concept.course, concept.blurb, ...concept.matchKeywords]
      for (const field of fields) {
        if (normalizeConceptText(field).includes(normalized)) score += normalized.length * 4
      }
    }
    // 简介只用于动画库过滤，权重低于标题和显式别名。
    const compactQuery = normalized.replace(/\s/g, "")
    const normalizedBlurb = normalizeConceptText(concept.blurb).replace(/\s/g, "")
    if (compactQuery.length >= 2 && normalizedBlurb.includes(compactQuery)) score += compactQuery.length
  }
  return score
}

/** 按工作台主题文本找最相关的概念动画；同分时保持注册表优先级。 */
export function matchConcept(topic: string): ConceptAnim | null {
  let best: ConceptAnim | null = null
  let bestScore = 0
  for (const concept of CONCEPT_ANIMS) {
    const score = conceptMatchScore(concept, topic)
    if (score > bestScore) {
      best = concept
      bestScore = score
    }
  }
  return best
}
