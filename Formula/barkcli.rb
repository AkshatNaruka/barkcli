class Barkcli < Formula
  desc "Git-native Kanban board CLI — tasks as YAML in your repo"
  homepage "https://github.com/AkshatNaruka/barkcli"
  version "0.2.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/AkshatNaruka/barkcli/releases/download/v0.2.0/barkcli-aarch64-apple-darwin.tar.gz"
      sha256 "105ecaeda6c70479125359fc35866c5d66a86088c0535c1cd78faeabdbacd159"
    else
      url "https://github.com/AkshatNaruka/barkcli/releases/download/v0.2.0/barkcli-x86_64-apple-darwin.tar.gz"
      sha256 "f7f3196473ba0fb041882f079ee451eda178d5843993c0f98f04e64220f4ddbf"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/AkshatNaruka/barkcli/releases/download/v0.2.0/barkcli-aarch64-unknown-linux-gnu.tar.gz"
      sha256 "69f47fcfcb3a362411ebfa0fea4dbe56fe78ed1415b4e52a9dcf249ce81115d4"
    else
      url "https://github.com/AkshatNaruka/barkcli/releases/download/v0.2.0/barkcli-x86_64-unknown-linux-gnu.tar.gz"
      sha256 "69f47fcfcb3a362411ebfa0fea4dbe56fe78ed1415b4e52a9dcf249ce81115d4"
    end
  end

  def install
    bin.install "barkcli"
  end

  test do
    system "#{bin}/barkcli", "--version"
  end

  # Keep Homebrew livecheck in sync with GitHub releases
  livecheck do
    url :stable
    regex(/^v?(\d+(?:\.\d+)+)$/i)
  end
end
