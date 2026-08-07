class Barkcli < Formula
  desc "Git-native Kanban board CLI — tasks as YAML in your repo"
  homepage "https://github.com/AkshatNaruka/barkcli"
  version "0.2.0"

  if OS.mac?
    if Hardware::CPU.arm?
      url "https://barkcli.vercel.app/downloads/barkcli-aarch64-apple-darwin.tar.gz"
      sha256 "105ecaeda6c70479125359fc35866c5d66a86088c0535c1cd78faeabdbacd159"
    else
      url "https://barkcli.vercel.app/downloads/barkcli-x86_64-apple-darwin.tar.gz"
      sha256 "f7f3196473ba0fb041882f079ee451eda178d5843993c0f98f04e64220f4ddbf"
    end
  elsif OS.linux?
    url "https://barkcli.vercel.app/downloads/barkcli-x86_64-unknown-linux-gnu.tar.gz"
    sha256 "69f47fcfcb3a362411ebfa0fea4dbe56fe78ed1415b4e52a9dcf249ce81115d4"
  end

  license "MIT"

  def install
    bin.install "barkcli"
  end

  test do
    system "#{bin}/barkcli", "--version"
  end
end
