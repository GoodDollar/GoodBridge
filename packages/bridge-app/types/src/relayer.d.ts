export declare const stop: () => void;
export declare const relayerApp: (bridges?: {
    [key: string]: string;
}[], interval?: number) => Promise<{
    [key: string]: string;
}[]>;
