const { spawn } = require("child_process");
const fs = require("fs");

// Function to run shell commands
const runCommand = (command) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { stdio: "inherit", shell: true });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          `Command '${command}' failed with code ${code} and signal ${signal}`
        );
      }
    });
  });
};

if (fs.existsSync("./node_modules")) {
  console.log("Node modules already installed. Starting the project...");
  startProject();
} else {
  installDependencies();
}

function installDependencies() {
  runCommand("npm install")
    .then(() => {
      console.log("Dependencies installed successfully.");
      startProject();
    })
    .catch((error) => {
      console.error("Error during setup:", error);
    });
}

function startProject() {
  console.log("Starting the project...");
  runCommand("node index.js")
    .then(() => {
      console.log("Project started successfully.");
    })
    .catch((error) => {
      console.error("Error starting the project:", error);
    });
}
