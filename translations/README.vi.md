# Dustcode

Dustcode là tác nhân lập trình AI mã nguồn mở dành riêng cho **VS Code**. Bản fork này chỉ duy trì tiện ích và backend đi kèm, không phát hành CLI độc lập, plugin JetBrains hay dịch vụ đám mây.

## Cài đặt

1. Build bằng `bun run build:vscode` từ thư mục gốc, hoặc tải artifact phù hợp từ một lần chạy **VS Code** thành công trong GitHub Actions của kho mã này.
2. Giải nén artifact nếu cần, rồi chọn `dustcode-<target>.vsix` bằng lệnh **Extensions: Install from VSIX...** trong VS Code.
3. Mở Dustcode và cấu hình nhà cung cấp mô hình riêng.

ID tiện ích là `dustcode.dustcode`; cài đặt dùng tiền tố `dustcode.*`, dữ liệu dự án nằm trong `.dustcode/`. Dustcode không nhập thông tin đăng nhập hay phiên làm việc từ Kilo Code. Không có cấu hình tự động xuất bản hay trang Marketplace Dustcode được xác nhận. Kilo Gateway là dịch vụ bên ngoài, không phải dịch vụ do Dustcode vận hành.

Xem [README gốc](../README.md) để biết hướng dẫn chuẩn về cấu hình và phát triển; xem [RELEASING.md](../RELEASING.md) về build và artifact VSIX.

## Nguồn Gốc Và Giấy Phép

Dustcode là bản fork của [Kilo Code](https://github.com/Kilo-Org/kilocode); backend kế thừa từ [OpenCode](https://github.com/anomalyco/opencode).

MIT. Bạn có thể sử dụng, chỉnh sửa và phân phối code này, kể cả cho mục đích thương mại, miễn là giữ lại thông tin ghi nhận và thông báo license. Xem [License](../LICENSE). Giữ nguyên các thông báo bản quyền và giấy phép của thành phần bên thứ ba.
