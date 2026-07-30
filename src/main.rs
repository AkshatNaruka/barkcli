mod cli;
mod commands;
mod models;
mod storage;
mod util;

fn main() {
    if let Err(e) = cli::run() {
        eprintln!("error: {}", e);
        std::process::exit(1);
    }
}
