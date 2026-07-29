import os
import subprocess
import sys

print("==================================================")
print("🚀 [N.E.X.A] Starting Node.js Server on HF Gradio...")
print("==================================================")

# Install npm production dependencies
subprocess.run(["npm", "install", "--production"], check=False)

# Force PORT to 7860 for Hugging Face Space routing if not specified
os.environ["PORT"] = os.environ.get("PORT", "7860")

# Launch N.E.X.A Express Server
sys.exit(os.system("node src/app.js"))
