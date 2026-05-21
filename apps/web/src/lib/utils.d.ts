import { type ClassValue } from "clsx";
export declare function cn(...inputs: ClassValue[]): string;
export declare function generateId(): string;
export declare function formatBytes(bytes: number): string;
export declare function formatRelativeTime(timestamp: number): string;
export declare function truncate(str: string, maxLength: number): string;
export declare function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): (...args: Parameters<T>) => void;
