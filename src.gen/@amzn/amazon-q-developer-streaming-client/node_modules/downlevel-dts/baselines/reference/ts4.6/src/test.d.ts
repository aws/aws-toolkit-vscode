export class C {
    get p(): number;
    set p(value: number);
    get q(): string;
    set r(value: boolean);
}
export namespace N {
    class D {
        get p(): number;
        set p(value: number);
        get q(): string;
        set r(value: boolean);
    }
}
export type { C as DetectiveComics };
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
