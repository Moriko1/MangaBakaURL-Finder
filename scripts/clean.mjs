import process from "node:process";
import { cleanGeneratedArtifacts } from "./variant-utils.mjs";

cleanGeneratedArtifacts(process.cwd());
