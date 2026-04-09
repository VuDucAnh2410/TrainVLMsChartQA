const pick = (xs: string[]) => xs[Math.floor(Math.random() * xs.length)];

export const generateAnswer = (question: string, hasImage: boolean) => {
  const q = (question || "").toLowerCase();

  if (!hasImage) {
    return {
      answer: "Chưa có ảnh ngữ cảnh",
      reasoning: "Bạn cần tải ảnh cho phiên này trước khi hỏi đáp theo biểu đồ.",
    };
  }

  const yesNo = /\b(không\?|khong\?|co\?|có\?|đúng\?|dung\?)\b/.test(q);
  if (yesNo) {
    const answer = pick(["Yes", "No"]);
    return {
      answer,
      reasoning:
        "Xác định đối tượng cần so sánh trên biểu đồ và đối chiếu nhãn/giá trị. Nếu điều kiện đúng thì trả lời Yes, ngược lại No.",
    };
  }

  if (q.includes("bao nhiêu") || q.includes("bao nhieu") || q.includes("how many")) {
    return {
      answer: String(pick(["3", "5", "7", "12"])),
      reasoning:
        "Đếm số hạng mục/nhãn xuất hiện trên biểu đồ (cột/đường/legend) theo yêu cầu câu hỏi.",
    };
  }

  if (q.includes("tỷ") || q.includes("%") || q.includes("phần trăm") || q.includes("phan tram")) {
    return {
      answer: pick(["14.2%", "28%", "63%", "7.5%"]),
      reasoning:
        "Đọc trực tiếp giá trị phần trăm từ nhãn/tooltip hoặc suy ra từ trục tỷ lệ và vị trí điểm dữ liệu.",
    };
  }

  return {
    answer: pick(["42", "126", "N/A", "0.57"]),
    reasoning:
      "Xác định hạng mục liên quan, đọc giá trị từ trục hoặc nhãn, sau đó thực hiện phép so sánh/tính toán đơn giản nếu cần.",
  };
};

