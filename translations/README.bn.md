# Dustcode

Dustcode শুধু **VS Code**-এর জন্য একটি ওপেন সোর্স AI কোডিং এজেন্ট। এই fork কেবল এক্সটেনশন ও এর সঙ্গে থাকা backend রক্ষণাবেক্ষণ করে; আলাদা CLI, JetBrains প্লাগইন বা ক্লাউড পণ্য প্রকাশ করে না।

## ইনস্টলেশন

1. রিপোজিটরির মূল ফোল্ডার থেকে `bun run build:vscode` চালান, অথবা এই রিপোজিটরির GitHub Actions-এ সফল **VS Code** রান থেকে আপনার প্ল্যাটফর্মের artifact ডাউনলোড করুন।
2. প্রয়োজনে artifact আনজিপ করে VS Code-এ **Extensions: Install from VSIX...** দিয়ে `dustcode-<target>.vsix` নির্বাচন করুন।
3. Dustcode খুলে মডেল প্রদানকারী আলাদাভাবে কনফিগার করুন।

এক্সটেনশনের ID `dustcode.dustcode`, সেটিংসের prefix `dustcode.*`, এবং প্রকল্পের অবস্থা `.dustcode/`-এ থাকে। Kilo Code-এর লগইন তথ্য বা সেশন আমদানি করা হয় না। স্বয়ংক্রিয় প্রকাশ বা নিশ্চিত Dustcode Marketplace পৃষ্ঠা কনফিগার করা নেই।

কনফিগারেশন ও উন্নয়নের প্রামাণ্য তথ্যের জন্য [মূল README](../README.md) দেখুন। VSIX build ও CI artifact-এর জন্য [RELEASING.md](../RELEASING.md) দেখুন।

## উৎস ও লাইসেন্স

Dustcode হলো [Kilo Code](https://github.com/Kilo-Org/kilocode)-এর fork; এর backend এসেছে [OpenCode](https://github.com/anomalyco/opencode) থেকে।

MIT। attribution এবং license notice রেখে আপনি এই code ব্যবহার, পরিবর্তন এবং distribute করতে পারেন, commercial ব্যবহারসহ। [License](../LICENSE) দেখুন। তৃতীয় পক্ষের copyright এবং license notice-ও অক্ষুণ্ণ রাখুন।
