/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import {
    getStringHash,
    removeAnsi,
    truncate,
    truncateProps,
    indent,
    sanitizeFilename,
    toSnakeCase,
    undefinedIfEmpty,
    formatTextWithIndent,
    formatTextWithIndent2,
} from '../../../shared/utilities/textUtilities'

describe('textUtilities', async function () {
    it('truncateProps()', async function () {
        const testObj = {
            a: 34234234234,
            b: '123456789',
            c: new Date(2023, 1, 1),
            d: '123456789_abcdefg_ABCDEFG',
            e: {
                e1: [4, 3, 7],
                e2: 'loooooooooo \n nnnnnnnnnnn \n gggggggg \n string',
            },
            f: () => {
                throw Error()
            },
        }
        const expected = {
            ...testObj,
            e: {
                e1: [...testObj.e.e1],
                e2: testObj.e.e2,
            },
        }

        assert.deepStrictEqual(truncateProps(testObj, 25), expected)
        assert.deepStrictEqual(truncateProps(testObj, 3, ['b']), {
            ...expected,
            b: '123…',
        })
        // Assert that original object didn't change.
        assert.deepStrictEqual(truncateProps(testObj, 25), expected)

        assert.deepStrictEqual(truncateProps(testObj, 3, ['a', 'b', 'd', 'f']), {
            ...expected,
            b: '123…',
            d: '123…',
        })
    })

    it('truncate()', async function () {
        assert.deepStrictEqual(truncate('abc 123', 3), 'abc…')
        assert.deepStrictEqual(truncate('abc 123', -3), '…123')
        assert.deepStrictEqual(truncate('abc 123', 1), 'a…')
        assert.deepStrictEqual(truncate('abc 123', -1), '…3')
        assert.deepStrictEqual(truncate('abc 123', 0), '…')
        assert.deepStrictEqual(truncate('abc 123', 99), 'abc 123')
        assert.deepStrictEqual(truncate('abc 123', -99), 'abc 123')
    })

    it('indent()', async function () {
        assert.deepStrictEqual(indent('abc\n123', 2, false), '  abc\n  123')
        assert.deepStrictEqual(indent('abc\n 123\n', 2, false), '  abc\n   123\n')
        assert.deepStrictEqual(indent('abc\n 123\n', 2, true), '  abc\n  123\n')
        assert.deepStrictEqual(indent('   abc\n\n  \n123\nfoo\n', 4, false), '       abc\n\n      \n    123\n    foo\n')
        assert.deepStrictEqual(indent('   abc\n\n    \n123\nfoo\n', 4, true), '    abc\n\n    \n    123\n    foo\n')
    })
})

describe('removeAnsi', async function () {
    it('removes ansi code from text', async function () {
        assert.strictEqual(removeAnsi('\u001b[31mHello World'), 'Hello World')
    })

    it('text without ansi code remains as-is', async function () {
        const text = 'Hello World 123!'
        assert.strictEqual(removeAnsi(text), text)
    })
})

describe('getStringHash', async function () {
    it('produces a hash', async function () {
        assert.ok(getStringHash('hello'))
    })

    it('produces a different hash for different strings', async function () {
        assert.notStrictEqual(getStringHash('hello'), getStringHash('hello '))
    })
})

describe('toSnakeCase', function () {
    const expected = {
        foo_bar_fi: 'fi',
        fi_fo_fum: 'fum',
    }

    it('converts camel case to snake case', function () {
        const input = {
            fooBarFi: 'fi',
            fiFoFum: 'fum',
        }

        assert.deepStrictEqual(toSnakeCase(input), expected)
    })

    it('converts pascal case to snake case', function () {
        const input = {
            FooBarFi: 'fi',
            FiFoFum: 'fum',
        }

        assert.deepStrictEqual(toSnakeCase(input), expected)
    })

    it('converts upper case to snake case', function () {
        const input = {
            FOO_BAR_FI: 'fi',
            FI_FO_FUM: 'fum',
        }

        assert.deepStrictEqual(toSnakeCase(input), expected)
    })

    it('maintains snake case', function () {
        assert.deepStrictEqual(toSnakeCase(expected), expected)
    })
})

interface TestCase<Input, Output> {
    input: Input
    params?: any[]
    output: Output
    case: string
}

function generateTestCases<Input, Output>(
    cases: TestCase<Input, Output>[],
    f: (t: Input, ...p: any[]) => Output
): void {
    for (const c of cases) {
        it(c.case, function () {
            assert.strictEqual(c.params ? f(c.input, ...c.params) : f(c.input), c.output)
        })
    }
}

describe('sanitizeFilename', function () {
    const cases = [
        { input: 'foo🤷', output: 'foo_', case: 'removes emojis' },
        { input: 'foo/zub', output: 'foo_zub', case: 'replaces slash with underscore' },
        { input: 'foo zub', output: 'foo_zub', case: 'replaces space with underscore' },
        { input: 'foo:bar', output: 'fooXbar', params: ['X'], case: 'replaces dot with replaceString' },
        { input: 'foo🤷bar/zu b.txt', output: 'foo_bar_zu_b.txt', case: 'docstring example' },
        { input: 'foo.txt', output: 'foo.txt', case: 'keeps dot' },
        { input: 'züb', output: 'züb', case: 'keeps special chars' },
    ]
    generateTestCases(cases, sanitizeFilename)
})

describe('undefinedIfEmpty', function () {
    const cases: { input: string | undefined; output: string | undefined; case: string }[] = [
        { input: undefined, output: undefined, case: 'return undefined if input is undefined' },
        { input: '', output: undefined, case: 'return undefined if input is empty string' },
        { input: '   ', output: undefined, case: 'return undefined if input is blank' },
        { input: 'foo', output: 'foo', case: 'return str if input is not empty' },
        { input: ' foo ', output: ' foo ', case: 'return original str without trim' },
    ]

    generateTestCases(cases, undefinedIfEmpty)
})

describe('formatStringWithIndent', function () {
    const cases = [
        { input: 'foo', output: 'foo', params: ['  '], case: 'return str if input is not multiline' },
        {
            input: 'foo\nbar',
            output: 'foo\n   bar',
            params: ['   '],
            case: 'return str with indent if input is multiline',
        },
        {
            input: 'foo\n\nbar',
            output: 'foo\n  \n  bar',
            params: ['  '],
            case: 'return str with indent if input is multiline with empty line',
        },
        {
            input: 'foo\nbar\nfoo\nbar\n',
            output: 'foo\n  bar\n  foo\n  bar\n  ',
            params: ['  '],
            case: 'return str with indent if input is multiline with empty line at the end',
        },
        {
            input: 'foo\nbar\nfoo\nbar\n',
            output: 'foo\nbar\nfoo\nbar\n',
            params: [''],
            case: 'returns original string with empty indent',
        },
    ]

    generateTestCases(cases, formatTextWithIndent)
})
