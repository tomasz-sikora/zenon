/**
 * OPFS (Origin Private File System) abstraction layer.
 * Provides a simple async CRUD API over the browser's private file system.
 */
export declare function getRoot(): Promise<FileSystemDirectoryHandle>;
export declare function ensureDir(path: string): Promise<FileSystemDirectoryHandle>;
export declare function writeFile(path: string, data: ArrayBuffer | string): Promise<void>;
export declare function readFile(path: string): Promise<ArrayBuffer>;
export declare function readFileText(path: string): Promise<string>;
export declare function readFileBlob(path: string): Promise<Blob>;
export declare function deleteFile(path: string): Promise<void>;
export declare function deleteDir(path: string, recursive?: boolean): Promise<void>;
export interface FileEntry {
    name: string;
    path: string;
    kind: "file" | "directory";
    size?: number;
    lastModified?: number;
    mimeType?: string;
}
export declare function listDir(path: string): Promise<FileEntry[]>;
export declare function fileExists(path: string): Promise<boolean>;
export declare function moveFile(from: string, to: string): Promise<void>;
export declare function guessMime(name: string): string;
/** Recursively list all files under a path */
export declare function listDirRecursive(path: string): Promise<FileEntry[]>;
/** Get total size of a directory */
export declare function getDirSize(path: string): Promise<number>;
