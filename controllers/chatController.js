const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Product } = require('../models');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// System prompt cho chatbot tư vấn thuê máy ảnh
const SYSTEM_PROMPT = `Bạn là một chuyên gia tư vấn thuê máy ảnh tại cửa hàng cho thuê camera.
Nhiệm vụ của bạn là giúp khách hàng hiểu rõ về sản phẩm và dịch vụ.

QUY TẮC:
1. Trả lời NGẮN GỌN, THÂN THIỆN bằng tiếng Việt (1-3 câu)
2. Dựa vào THÔNG TIN SẢN PHẨM được cung cấp bên dưới để trả lời câu hỏi
3. Chỉ gửi LINK sản phẩm (/products/{id}) KHI:
   - Khách HỎI SẢN PHẨM CỤ THỂ (tên model, hãng cụ thể)
   - Khách MUỐN ĐẶT THUÊ hoặc CHỐT thuê
   - Khách muốn XEM CHI TIẾT sản phẩm
4. Bình thường chỉ trả lời thông tin, KHÔNG gửi link
5. Giá tiền là giá THUÊ theo ngày (VNĐ)
6. Khuyến khích khách hàng đặt thuê nếu phù hợp

PHONG CÁCH:
- Nhiệt tình, chuyên nghiệp
- Dùng emoji phù hợp`;

const chatWithAI = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, error: 'Tin nhắn không được để trống' });
    }

    console.log('Chat request - Message:', message);

    // Lấy danh sách sản phẩm từ database
    const products = await Product.find({ isAvailable: true })
      .select('name brand category pricing description')
      .sort({ createdAt: -1 })
      .limit(50);

    let productInfo = '';
    if (products.length > 0) {
      productInfo = products.map(p => 
        `[ID:${p._id}] ${p.name} | Hãng: ${p.brand} | Loại: ${p.category} | Giá: ${p.pricing?.price1d?.toLocaleString('vi-VN') || 0}đ/ngày | ${p.description?.substring(0, 100) || ''}`
      ).join('\n');
    } else {
      productInfo = 'Chưa có sản phẩm trong cửa hàng';
    }

    // Sử dụng model gemini-2.5-flash
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const fullPrompt = `${SYSTEM_PROMPT}

THÔNG TIN SẢN PHẨM TRONG CỬA HÀNG:
${productInfo}

KHÁCH HÀNG HỎI: ${message}

TRẢ LỜI (luôn kèm link sản phẩm dạng /products/{id} khi đề cập sản phẩm):`;

    console.log('Sending request to Gemini...');
    const result = await model.generateContent(fullPrompt);
    console.log('Gemini response received');
    const response = await result.response;
    const text = response.text();

    res.json({
      success: true,
      reply: text
    });

  } catch (error) {
    console.error('Chat AI Error:', error.message);
    console.error('Error details:', error);
    
    res.status(500).json({
      success: false,
      error: 'Đã xảy ra lỗi khi xử lý tin nhắn',
      details: error.message
    });
  }
};

module.exports = { chatWithAI };
