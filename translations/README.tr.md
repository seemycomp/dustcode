# Dustcode

Dustcode yalnızca **VS Code** için açık kaynaklı bir yapay zekâ kodlama ajanıdır. Bu fork sadece uzantıyı ve gömülü backend'i sürdürür; bağımsız CLI, JetBrains eklentisi veya bulut ürünü dağıtmaz.

## Kurulum

1. Depo kökünde `bun run build:vscode` çalıştırın veya bu deponun GitHub Actions bölümündeki başarılı bir **VS Code** çalıştırmasından platformunuza uygun çıktıyı indirin.
2. Gerekirse arşivi açın ve VS Code'da **Extensions: Install from VSIX...** ile `dustcode-<target>.vsix` dosyasını seçin.
3. Dustcode'u açın ve bir model sağlayıcısını ayrıca yapılandırın.

Uzantı kimliği `dustcode.dustcode`, ayar öneki `dustcode.*`, proje durumu dizini `.dustcode/` şeklindedir. Kilo Code kimlik bilgileri ve oturumları içe aktarılmaz. Otomatik yayınlama veya doğrulanmış bir Dustcode Marketplace sayfası yapılandırılmamıştır.

Yapılandırma ve geliştirme için esas kaynak [ana README](../README.md) dosyasıdır. VSIX derlemeleri ve CI çıktıları için [RELEASING.md](../RELEASING.md) dosyasına bakın.

## Köken Ve Lisans

Dustcode, [Kilo Code](https://github.com/Kilo-Org/kilocode) projesinin bir fork'udur; backend [OpenCode](https://github.com/anomalyco/opencode) kökenlidir.

MIT. Atıf ve lisans bildirimlerini koruduğunuz sürece bu kodu ticari olarak da kullanabilir, değiştirebilir ve dağıtabilirsiniz. Bkz. [License](../LICENSE). Üçüncü taraf bileşenlerin telif hakkı ve lisans bildirimlerini de koruyun.
