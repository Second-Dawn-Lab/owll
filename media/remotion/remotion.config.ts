import { Config } from "@remotion/cli/config";

// WebGL in headless Chrome: ANGLE (uses the GPU through Direct3D on Windows).
Config.setChromiumOpenGlRenderer("angle");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setCodec("h264");
Config.setOverwriteOutput(true);
