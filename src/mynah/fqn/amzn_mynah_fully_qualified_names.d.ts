/* tslint:disable */
/* eslint-disable */
/**
 */
export class Extent {
  free(): void;
  /**
   * @param {Location} start
   * @param {Location} end
   */
  constructor(start: Location, end: Location);
  /**
   * Check if two extents overlap, i.e. the one extent is (partially) included in the other.
   * @param {Extent} other
   * @returns {boolean}
   */
  overlaps_with(other: Extent): boolean;
  /**
   */
  end: Location;
  /**
   */
  start: Location;
}
/**
 */
export class Java {
  free(): void;
  /**
   * @param {string} code
   * @returns {Promise<any>}
   */
  static findNames(code: string): Promise<any>;
  /**
   * @param {string} code
   * @param {Extent} extent
   * @returns {Promise<any>}
   */
  static findNamesWithInExtent(code: string, extent: Extent): Promise<any>;
}
/**
 */
export class Location {
  free(): void;
  /**
   * @param {number} line
   * @param {number} character
   */
  constructor(line: number, character: number);
  /**
   */
  character: number;
  /**
   */
  line: number;
}
/**
 */
export class Python {
  free(): void;
  /**
   * @param {string} code
   * @returns {Promise<any>}
   */
  static findNames(code: string): Promise<any>;
  /**
   * @param {string} code
   * @param {Extent} extent
   * @returns {Promise<any>}
   */
  static findNamesWithInExtent(code: string, extent: Extent): Promise<any>;
}
/**
 */
export class Tsx {
  free(): void;
  /**
   * @param {string} code
   * @returns {Promise<any>}
   */
  static findNames(code: string): Promise<any>;
  /**
   * @param {string} code
   * @param {Extent} extent
   * @returns {Promise<any>}
   */
  static findNamesWithInExtent(code: string, extent: Extent): Promise<any>;
}
/**
 */
export class TypeScript {
  free(): void;
  /**
   * @param {string} code
   * @returns {Promise<any>}
   */
  static findNames(code: string): Promise<any>;
  /**
   * @param {string} code
   * @param {Extent} extent
   * @returns {Promise<any>}
   */
  static findNamesWithInExtent(code: string, extent: Extent): Promise<any>;
}
