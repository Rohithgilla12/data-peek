cask "data-peek" do
  arch arm: "arm64", intel: "x64"

  version "0.14.0"

  on_arm do
    sha256 "21c958512e13afac544c0559d51c741b5e53dff7380658a1c12a61bc0e3f482a"
  end

  on_intel do
    sha256 "8d97319d9af3b226532c22eafe04cd40849dd2018280c4424a3705979d7b035f"
  end

  url "https://github.com/Rohithgilla12/data-peek/releases/download/v#{version}/data-peek-#{version}-#{arch}.dmg",
      verified: "github.com/Rohithgilla12/data-peek/"
  name "Data Peek"
  desc "Minimal, fast SQL client desktop application"
  homepage "https://github.com/Rohithgilla12/data-peek"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: ">= :catalina"

  app "data-peek.app"

  zap trash: [
    "~/Library/Application Support/data-peek",
    "~/Library/Preferences/dev.datapeek.app.plist",
    "~/Library/Saved Application State/dev.datapeek.app.savedState",
  ]
end
