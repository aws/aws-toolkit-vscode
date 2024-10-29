export class C {
    p: number;
    readonly q: string;
    r: boolean;
}
export namespace N {
    class D {
        p: number;
        readonly q: string;
        r: boolean;
    }
}
export { C as DetectiveComics };
export type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;
export interface E {
    a: number;
    b: number;
}
export type F = Omit<E, 'a'>;
export type Getter<T> = () => T;
export type Setter<T> = (value: T) => void;
export interface State<T> {
    get: () => T;
    set: (value: T) => void;
}
