import type {
  ChartItem,
  PredictAnswer,
  PredictRequest,
  UploadChartInput,
} from "./types";

const isoNow = () => new Date().toISOString();

const chartImage = (seed: string) => {
  const prompt = encodeURIComponent(
    `modern data visualization dashboard screenshot, single chart on light background, indigo accent color, clean minimal UI, soft shadows, high resolution, no text watermark, ${seed}`,
  );
  return `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${prompt}&image_size=landscape_4_3`;
};

export const mockCourses = ["Mô-đun A", "Mô-đun B", "Mô-đun C"];

export const mockCharts: ChartItem[] = [
  {
    id: "c_01",
    title: "Phiên trò chuyện: Chỉ số Hiệu suất",
    description: "Hỏi đáp về xu hướng tăng trưởng theo tuần.",
    course: "Mô-đun A",
    type: "line",
    status: "processed",
    createdAt: "2024-03-12T09:12:00.000Z",
    fileName: "Chart_Analysis_V4.png",
    imageUrl: chartImage("line-chart"),
  },
  {
    id: "c_02",
    title: "Phiên trò chuyện: Dự báo Tăng trưởng 2024",
    description: "Giải thích biến động theo quý.",
    course: "Mô-đun B",
    type: "bar",
    status: "new",
    createdAt: "2024-03-10T14:40:00.000Z",
    fileName: "Growth_2024.png",
    imageUrl: chartImage("bar-chart"),
  },
  {
    id: "c_03",
    title: "Phiên trò chuyện: Tỷ lệ Hoàn thành",
    description: "So sánh theo lớp và theo thời gian.",
    course: "Mô-đun C",
    type: "pie",
    status: "processed",
    createdAt: "2024-03-08T08:00:00.000Z",
    fileName: "Completion_Rate.png",
    imageUrl: chartImage("pie-chart"),
  },
];

let predictLog: PredictAnswer[] = [];

export const getPredictLog = (chartId: string) => {
  return predictLog.filter((x) => x.chartId === chartId);
};

export const mockPredict = async (
  req: PredictRequest,
): Promise<PredictAnswer> => {
  const start = performance.now();
  await new Promise((r) => setTimeout(r, 650 + Math.random() * 650));

  const answers = ["14.2%", "126 tỷ", "42", "Tăng 3.1% QoQ"];
  const answer = answers[Math.floor(Math.random() * answers.length)];

  const item: PredictAnswer = {
    id: `pa_${Math.random().toString(36).slice(2, 8)}`,
    chartId: req.chartId,
    question: req.question,
    answer,
    reasoning:
      "Xác định khu vực nổi bật trên biểu đồ và đối chiếu nhãn trục/legend. Sau đó ước lượng giá trị theo điểm giao và kiểm tra xu hướng lân cận để giải thích biến động.",
    latencyMs: Math.round(performance.now() - start),
    status: "ok",
    createdAt: isoNow(),
  };

  predictLog = [item, ...predictLog].slice(0, 200);
  return item;
};

export const addChart = (input: UploadChartInput): ChartItem => {
  const id = `c_${Math.random().toString(36).slice(2, 8)}`;
  const item: ChartItem = {
    id,
    title: input.title || input.file.name,
    description: input.description,
    course: input.course || "Mô-đun mới",
    type: "other",
    status: "processed",
    createdAt: isoNow(),
    fileName: input.file.name,
    imageUrl: URL.createObjectURL(input.file),
  };
  mockCharts.unshift(item);
  return item;
};

export const createConversation = (seed?: {
  course?: string;
  title?: string;
}): ChartItem => {
  const id = `c_${Math.random().toString(36).slice(2, 8)}`;
  const item: ChartItem = {
    id,
    title: seed?.title || "Cuộc trò chuyện mới",
    description: "Bắt đầu bằng cách tải ảnh (tuỳ chọn) và đặt câu hỏi.",
    course: seed?.course || mockCourses[0],
    type: "other",
    status: "new",
    createdAt: isoNow(),
  };
  mockCharts.unshift(item);
  return item;
};

export const setConversationImage = (id: string, file: File) => {
  const item = mockCharts.find((c) => c.id === id);
  if (!item) return;
  item.fileName = file.name;
  item.imageUrl = URL.createObjectURL(file);
  item.status = "processed";
};

export const renameConversation = (id: string, title: string) => {
  const item = mockCharts.find((c) => c.id === id);
  if (!item) return;
  item.title = title;
};
