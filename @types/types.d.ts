declare module Chai {
    interface Assertion {
        bignumber: Assertion;
    }
}

declare module 'ganache-time-traveler' {
    export function takeSnapshot(): Promise<any>;
    export function revertToSnapshot(id: string): Promise<any>;
    export function advanceTime(time: number): Promise;
    export function advanceBlock(): Promise;
  }
