declare namespace Wemo {

    type Event = "binaryState" | "error" | "statusChange" | "insightParams" | "attributeList" | "newListener";

    export interface IEventEmitter {
        addListener(event: Event, listener: Function): this;
        on(event: Event, listener: Function): this;
        once(event: Event, listener: Function): this;
        removeListener(event: Event, listener: Function): this;
        removeAllListeners(event?: Event): this;
        setMaxListeners(n: number): this;
        getMaxListeners(): number;
        listeners(event: Event): Function[];
        emit(event: Event, ...args: any[]): boolean;
        listenerCount(type: string): number;
    }

    export interface IWemoClientDiscoverOpts {
        unicastBindPort: number
    }

    export interface IWemoClientConfig {
        port?: number,
        discover_opts?: IWemoClientDiscoverOpts
    }

    export interface IDevice {
        deviceType: string;
        friendlyName: string;
        manufacturer: string;
        manufacturerURL: string;
        modelDescription: string;
        modelName: string;
        modelNumber: string;
        modelURL: string;
        serialNumber: string;
        UDN: string;
        UPC: string;
        macAddress: string;
        firmwareVersion: string;
        iconVersion: string;
        binaryState: string;
        iconList: any;
        serviceList: any;
        presentationURL: string;
        host: string;
        port: string;
        callbackURL: string;
    }

    export interface IClient extends IEventEmitter {
        host: string;
        port: string;
        deviceType: string;
        UDN: string;
        callbackURL: string;
        error: string;
        device: IDevice;

        setBinaryState(value: string, cb?: (err: Error, response?: string) => void): void;
        getBinaryState(cb: (err: Error, binaryState?: string) => void): void;
    }

    export class Wemo {
        constructor(config?: IWemoClientConfig);

        discover(cb: (err: Error, deviceInfo: IDevice) => void): void;
        client(device: IDevice): IClient
    }
}

declare module "wemo-client" {
    export = Wemo.Wemo;
}