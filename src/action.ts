#!/usr/bin/env node
import { runAction } from "./action-runner.js";

process.exitCode = await runAction();
