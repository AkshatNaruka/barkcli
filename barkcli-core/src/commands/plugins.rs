use anyhow::Result;
use crate::plugin::{PluginManager, PluginLoader};

pub fn run_plugins(args: &[String]) -> Result<()> {
    if args.is_empty() {
        print_usage();
        return Ok(());
    }

    match args[0].as_str() {
        "list" | "ls" => list_plugins(),
        "load" => load_plugins(),
        "init" => init_plugins(),
        "info" => show_info(&args[1..]),
        "help" | "-h" | "--help" => {
            print_usage();
            Ok(())
        }
        _ => {
            print_usage();
            Ok(())
        }
    }
}

fn print_usage() {
    println!("Usage: barkcli plugins <command>");
    println!();
    println!("Commands:");
    println!("  list, ls    List loaded plugins");
    println!("  load        Discover and load plugins from search paths");
    println!("  init        Initialize all loaded plugins");
    println!("  info <name> Show plugin information");
}

fn list_plugins() -> Result<()> {
    let mut pm = PluginManager::new();
    pm.load_core_plugins()?;
    pm.init_all()?;
    
    println!("Loaded plugins:");
    for name in pm.registry.list() {
        if let Some(plugin) = pm.registry.get(&name) {
            println!("  {} v{} - {}", plugin.name(), plugin.version(), plugin.description().unwrap_or(""));
        }
    }
    println!("\nTotal: {} plugin(s)", pm.registry.list().len());
    Ok(())
}

fn load_plugins() -> Result<()> {
    let mut pm = PluginManager::new();
    pm.load_core_plugins()?;
    
    let loader = PluginLoader::new();
    loader.load_all(&mut pm.registry)?;
    
    println!("Discovered plugins from search paths:");
    for path in loader.discover() {
        println!("  {}", path);
    }
    println!("\nCore plugins loaded. Use 'barkcli plugins init' to initialize.");
    Ok(())
}

fn init_plugins() -> Result<()> {
    let mut pm = PluginManager::new();
    pm.load_core_plugins()?;
    pm.init_all()?;
    
    println!("All plugins initialized successfully.");
    println!("Commands registered: {}", pm.registry.list().iter()
        .filter_map(|n| pm.registry.get(n))
        .count());
    Ok(())
}

fn show_info(args: &[String]) -> Result<()> {
    if args.is_empty() {
        println!("Usage: barkcli plugins info <name>");
        return Ok(());
    }
    
    let mut pm = PluginManager::new();
    pm.load_core_plugins()?;
    pm.init_all()?;
    
    let name = &args[0];
    if let Some(plugin) = pm.registry.get(name) {
        println!("Plugin: {}", plugin.name());
        println!("Version: {}", plugin.version());
        if let Some(desc) = plugin.description() {
            println!("Description: {}", desc);
        }
        if let Some(author) = plugin.author() {
            println!("Author: {}", author);
        }
        println!("Dependencies: {:?}", plugin.dependencies());
    } else {
        println!("Plugin '{}' not found", name);
    }
    Ok(())
}
