async function boot(): Promise<void> {
  try {
    const { main } = await import('./index-logic.js');
    await main();
  } catch (error: any) {
    console.error(`\n${error.message}`);
    process.exit(1);
  }
}

boot();