class Barkcli < Formula
  desc "Git-native Kanban board CLI — tasks as YAML in your repo"
  homepage "https://github.com/AkshatNaruka/barkcli"
  version "0.2.0"

  if OS.mac?
    if Hardware::CPU.arm?
      url "https://barkcli.vercel.app/downloads/barkcli-aarch64-apple-darwin.tar.gz"
      sha256 "TBD"
    else
      url "https://barkcli.vercel.app/downloads/barkcli-x86_64-apple-darwin.tar.gz"
      sha256 "TBD"
    end
  elsif OS.linux?
    url "https://barkcli.vercel.app/downloads/barkcli-x86_64-unknown-linux-gnu.tar.gz"
    sha256 "TBD"
  end

  license "MIT"

  def install
    bin.install "barkcli"
  end

  test do
    system "#{bin}/barkcli", "--version"
  end
end
