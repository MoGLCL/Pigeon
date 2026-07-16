async function start() {
  const mode = process.argv[2] === "production" ? "production" : "development";
  Object.assign(process.env, { NODE_ENV: mode });
  await import("../server");
}

void start().catch(error => {
  console.error("Failed to launch Pigeon", error);
  process.exitCode = 1;
});
