class Barkcli < Formula
  desc "Git-native Kanban board CLI — tasks as YAML in your repo"
  homepage "https://getbarkcli.dev"
  url "https://github.com/AkshatNaruka/barkcli/archive/refs/tags/v0.2.0.tar.gz"
  sha256 "TBD"
  license "Proprietary"
  version "0.2.0"
  head "https://github.com/AkshatNaruka/barkcli.git", branch: "master"

  depends_on "rust" => :build

  def install
    system "cargo", "install", "--path", ".", "--root", prefix
  end

  test do
    system "#{bin}/barkcli", "--version"
  end
end
