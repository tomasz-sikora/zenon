/**
 * Pyodide bridge — communicates with the tools Web Worker to execute Python code.
 */
declare function execPython(code: string): Promise<{
    result: unknown;
    stdout: string;
    stderr: string;
    figures: string[];
}>;
declare function installPackages(packages: string[]): Promise<void>;
export { execPython, installPackages };
