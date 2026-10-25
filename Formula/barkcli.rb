class Barkcli < Formula
  desc "The management layer for AI agents — intent, plans, worktrees, test gate, merge train"
  homepage "https://github.com/AkshatNaruka/barkcli"
  version "0.4.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/AkshatNaruka/barkcli/releases/download/v0.4.0/barkcli-aarch64-apple-darwin.tar.gz"
      sha256 "12b4ba3410b88c623836e41f75668d82075e8574b52665739d0b6092044d4b4e"
    else
      url "https://github.com/AkshatNaruka/barkcli/releases/download/v0.4.0/barkcli-x86_64-apple-darwin.tar.gz"
      sha256 "563e9cf75f3127982732682f8114c63bdf1b620a68e58267783f1dbb5947f941"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/AkshatNaruka/barkcli/releases/download/v0.4.0/barkcli-aarch64-unknown-linux-gnu.tar.gz"
      sha256 "2c519f971b26e6123576e1bbb57008bb3583fc123aa93c9737566927e464beb6"
    else
      url "https://github.com/AkshatNaruka/barkcli/releases/download/v0.4.0/barkcli-x86_64-unknown-linux-gnu.tar.gz"
      sha256 "2e90a6a5e36a56504e9d931d9003f44e4f261ccf63e85335cafa5727e2a6342f"
    end
  end

  def install
    bin.install "barkcli"
  end

  test do
    system "#{bin}/barkcli", "--version"
  end

  livecheck do
    url :stable
    regex(/^v?(d+(?:.d+)+)$/i)
  end
end
