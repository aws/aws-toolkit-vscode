import * as assert from 'assert';
import { safeGet } from '../shared/extensionUtilities';

suite('Extension Utilities Tests', function (): void {
    class Blah {
        public someProp?: string;

        constructor(someProp?: string) {
            this.someProp = someProp;
        }
    }

    test('nullSafeGet can access sub-property', function () {
        assert.equal(safeGet(new Blah('hello!'), x => x.someProp), 'hello!');
        assert.equal(safeGet(new Blah(), x => x.someProp), undefined);
        assert.equal(safeGet(undefined as Blah | undefined, x => x.someProp), undefined);
    });
});