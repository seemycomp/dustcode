# Dustcode

Dustcode เป็นเอเจนต์เขียนโค้ด AI แบบโอเพนซอร์สสำหรับ **VS Code** เท่านั้น fork นี้ดูแลเฉพาะส่วนขยายและ backend ที่รวมมาด้วย ไม่ได้เผยแพร่ CLI แยกต่างหาก ปลั๊กอิน JetBrains หรือผลิตภัณฑ์คลาวด์

## การติดตั้ง

1. รัน `bun run build:vscode` จากรากของรีโพซิทอรี หรือดาวน์โหลด artifact สำหรับแพลตฟอร์มของคุณจากการรัน **VS Code** ที่สำเร็จใน GitHub Actions ของรีโพซิทอรีนี้
2. แตกไฟล์หากจำเป็น แล้วเลือก `dustcode-<target>.vsix` ผ่านคำสั่ง **Extensions: Install from VSIX...** ใน VS Code
3. เปิด Dustcode และตั้งค่าผู้ให้บริการโมเดลแยกต่างหาก

ID ส่วนขยายคือ `dustcode.dustcode` การตั้งค่าใช้ `dustcode.*` และสถานะโปรเจกต์อยู่ใน `.dustcode/` ไม่มีการนำเข้าข้อมูลเข้าสู่ระบบหรือเซสชันจาก Kilo Code และยังไม่มีการตั้งค่าเผยแพร่อัตโนมัติหรือหน้า Dustcode Marketplace ที่ยืนยันแล้ว

ดู [README หลัก](../README.md) สำหรับข้อมูลอ้างอิงด้านการตั้งค่าและการพัฒนา และ [RELEASING.md](../RELEASING.md) สำหรับการ build VSIX และ artifact ของ CI

## ที่มาและสัญญาอนุญาต

Dustcode เป็น fork ของ [Kilo Code](https://github.com/Kilo-Org/kilocode) ซึ่ง backend มีที่มาจาก [OpenCode](https://github.com/anomalyco/opencode)

MIT คุณสามารถใช้ แก้ไข และแจกจ่ายโค้ดนี้ รวมถึงเชิงพาณิชย์ ตราบใดที่ยังเก็บ attribution และประกาศ license ไว้ ดู [License](../LICENSE) และเก็บประกาศลิขสิทธิ์กับสัญญาอนุญาตของส่วนประกอบบุคคลที่สามไว้ด้วย
