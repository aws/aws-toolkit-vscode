/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { FocusAreaContextExtractor } from '../../../../../codewhispererChat/editor/context/focusArea/focusAreaExtractor'
import { Range, TextDocument } from 'vscode'
import { createMockDocument } from '../../../../codewhisperer/testUtil'

const checkIfExpectedRangeEqualActualRange = (expectedRange: any, actualRange: Range) => {
    assert.strictEqual(actualRange.start.line, expectedRange.start.line)
    assert.strictEqual(actualRange.start.character, expectedRange.start.character)
    assert.strictEqual(actualRange.end.line, expectedRange.end.line)
    assert.strictEqual(actualRange.end.character, expectedRange.end.character)
}

describe('getSelectionInsideExtendedCodeBlock', () => {
    it('returns undefined if selection start and end are same line and character (it means that selection is empty)', () => {
        // Stub originSelection and extendedCodeBlockRange
        const originSelection = {
            start: {
                line: 0,
                character: 0,
            },
            end: {
                line: 0,
                character: 0,
            },
        }

        const extendedCodeBlockRange = {
            start: {
                line: 2,
                character: 0,
            },
            end: {
                line: 3,
                character: 0,
            },
        }

        const focusAreaContextExtractor = new FocusAreaContextExtractor()
        const method = Reflect.get(focusAreaContextExtractor, 'getSelectionInsideExtendedCodeBlock')

        const result = method.call(focusAreaContextExtractor, originSelection, extendedCodeBlockRange)

        assert.strictEqual(result, undefined)
    })

    it('returns adjusted selection if selection spans multiple lines', () => {
        // Stub originSelection and extendedCodeBlockRange
        const originSelection = {
            start: {
                line: 10,
                character: 5,
            },
            end: {
                line: 20,
                character: 4,
            },
        }

        const extendedCodeBlockRange = {
            start: {
                line: 9,
                character: 0,
            },
            end: {
                line: 25,
                character: 0,
            },
        }

        const focusAreaContextExtractor = new FocusAreaContextExtractor()
        const method = Reflect.get(focusAreaContextExtractor, 'getSelectionInsideExtendedCodeBlock')

        const result = method.call(focusAreaContextExtractor, originSelection, extendedCodeBlockRange)

        checkIfExpectedRangeEqualActualRange(
            {
                start: {
                    line: 1,
                    character: 5,
                },
                end: {
                    line: 11,
                    character: 4,
                },
            },
            result
        )
    })
    it('returns adjusted selection for one-line selection', () => {
        // Stub originSelection and extendedCodeBlockRange
        const originSelection = {
            start: {
                line: 10,
                character: 5,
            },
            end: {
                line: 10,
                character: 50,
            },
        }

        const extendedCodeBlockRange = {
            start: {
                line: 10,
                character: 4,
            },
            end: {
                line: 10,
                character: 51,
            },
        }

        const focusAreaContextExtractor = new FocusAreaContextExtractor()
        const method = Reflect.get(focusAreaContextExtractor, 'getSelectionInsideExtendedCodeBlock')

        const result = method.call(focusAreaContextExtractor, originSelection, extendedCodeBlockRange)

        checkIfExpectedRangeEqualActualRange(
            {
                start: {
                    line: 0,
                    character: 1,
                },
                end: {
                    line: 0,
                    character: 46,
                },
            },
            result
        )
    })
})

describe('trimRangeAccordingToLimits', () => {
    it('cut characters from the last line', () => {
        // Arrange
        const document: TextDocument = createMockDocument('01234567\n0123456789\n0123456')
        const range = {
            start: {
                line: 0,
                character: 7,
            },
            end: {
                line: 1,
                character: 10,
            },
        }
        const limit = 5

        // Act
        const focusAreaContextExtractor = new FocusAreaContextExtractor()
        const method = Reflect.get(focusAreaContextExtractor, 'trimRangeAccordingToLimits')
        const result = method.call(focusAreaContextExtractor, document, range, limit)

        // Assert
        checkIfExpectedRangeEqualActualRange(
            {
                start: {
                    line: 0,
                    character: 7,
                },
                end: {
                    line: 1,
                    character: 3,
                },
            },
            result
        )
    })
    it('cut the last line', () => {
        // Arrange
        const document: TextDocument = createMockDocument('01234567\n0123456789\n0123456')
        const range = {
            start: {
                line: 0,
                character: 0,
            },
            end: {
                line: 1,
                character: 10,
            },
        }
        const limit = 9

        // Act
        const focusAreaContextExtractor = new FocusAreaContextExtractor()
        const method = Reflect.get(focusAreaContextExtractor, 'trimRangeAccordingToLimits')
        const result = method.call(focusAreaContextExtractor, document, range, limit)

        // Assert
        checkIfExpectedRangeEqualActualRange(
            {
                start: {
                    line: 0,
                    character: 0,
                },
                end: {
                    line: 1,
                    character: 0,
                },
            },
            result
        )
    })

    it('cut characters from the first line', () => {
        // Arrange
        const document: TextDocument = createMockDocument('01234567\n0123456789\n0123456')
        const range = {
            start: {
                line: 0,
                character: 0,
            },
            end: {
                line: 1,
                character: 10,
            },
        }
        const limit = 5

        // Act
        const focusAreaContextExtractor = new FocusAreaContextExtractor()
        const method = Reflect.get(focusAreaContextExtractor, 'trimRangeAccordingToLimits')
        const result = method.call(focusAreaContextExtractor, document, range, limit)

        // Assert
        checkIfExpectedRangeEqualActualRange(
            {
                start: {
                    line: 0,
                    character: 0,
                },
                end: {
                    line: 0,
                    character: 4,
                },
            },
            result
        )
    })
})

describe('getExtendedCodeBlockRange', () => {
    it('extends range to the beginning of the line if length is below limit', () => {
        // Arrange
        const document: TextDocument = createMockDocument('01234567\n0123456789')
        const range = {
            start: {
                line: 1,
                character: 8,
            },
            end: {
                line: 1,
                character: 9,
            },
        }
        const limit = 10

        // Act
        const focusAreaContextExtractor = new FocusAreaContextExtractor()
        const method = Reflect.get(focusAreaContextExtractor, 'getExtendedCodeBlockRange')
        const result = method.call(focusAreaContextExtractor, document, range, limit)

        // Assert
        checkIfExpectedRangeEqualActualRange(
            {
                start: {
                    line: 1,
                    character: 0,
                },
                end: {
                    line: 1,
                    character: 9,
                },
            },
            result
        )
    })

    it('extends range to previous line if length is below limit', () => {
        // Arrange
        const document: TextDocument = createMockDocument('01234567\n0123456789')
        const range = {
            start: {
                line: 1,
                character: 0,
            },
            end: {
                line: 1,
                character: 9,
            },
        }
        const limit = 50

        // Act
        const focusAreaContextExtractor = new FocusAreaContextExtractor()
        const method = Reflect.get(focusAreaContextExtractor, 'getExtendedCodeBlockRange')
        const result = method.call(focusAreaContextExtractor, document, range, limit)

        // Assert
        checkIfExpectedRangeEqualActualRange(
            {
                start: {
                    line: 0,
                    character: 0,
                },
                end: {
                    line: 1,
                    character: 10,
                },
            },
            result
        )
    })

    it('extends range to previous line if length is below limit (we have empty new line in the end)', () => {
        // Arrange
        const document: TextDocument = createMockDocument('01234567\n0123456789\n')
        const range = {
            start: {
                line: 1,
                character: 0,
            },
            end: {
                line: 1,
                character: 9,
            },
        }
        const limit = 50

        // Act
        const focusAreaContextExtractor = new FocusAreaContextExtractor()
        const method = Reflect.get(focusAreaContextExtractor, 'getExtendedCodeBlockRange')
        const result = method.call(focusAreaContextExtractor, document, range, limit)

        // Assert
        checkIfExpectedRangeEqualActualRange(
            {
                start: {
                    line: 0,
                    character: 0,
                },
                end: {
                    line: 2,
                    character: 0,
                },
            },
            result
        )
    })

    it('extends range to next line if length is below limit', () => {
        // Arrange
        const document: TextDocument = createMockDocument('01234567\n0123456789\n')
        const range = {
            start: {
                line: 0,
                character: 0,
            },
            end: {
                line: 0,
                character: 1,
            },
        }
        const limit = 50

        // Act
        const focusAreaContextExtractor = new FocusAreaContextExtractor()
        const method = Reflect.get(focusAreaContextExtractor, 'getExtendedCodeBlockRange')
        const result: Range = method.call(focusAreaContextExtractor, document, range, limit)

        // Assert
        checkIfExpectedRangeEqualActualRange(
            {
                start: {
                    line: 0,
                    character: 0,
                },
                end: {
                    line: 2,
                    character: 0,
                },
            },
            result
        )
    })

    it('extends range to whole line if length is below limit and we have only one line in file', () => {
        // Arrange
        const document: TextDocument = createMockDocument('0123456789\n')
        const range = {
            start: {
                line: 0,
                character: 3,
            },
            end: {
                line: 0,
                character: 4,
            },
        }
        const limit = 50

        // Act
        const focusAreaContextExtractor = new FocusAreaContextExtractor()
        const method = Reflect.get(focusAreaContextExtractor, 'getExtendedCodeBlockRange')
        const result = method.call(focusAreaContextExtractor, document, range, limit)

        // Assert
        checkIfExpectedRangeEqualActualRange(
            {
                start: {
                    line: 0,
                    character: 0,
                },
                end: {
                    line: 1,
                    character: 0,
                },
            },
            result
        )
    })

    it('extends range to one line from each side if length is below limit', () => {
        // Arrange
        const document: TextDocument = createMockDocument('0123456789\n0123456789\n0123456789\n0123456789\n')
        const range = {
            start: {
                line: 2,
                character: 3,
            },
            end: {
                line: 2,
                character: 4,
            },
        }
        const limit = 33

        // Act
        const focusAreaContextExtractor = new FocusAreaContextExtractor()
        const method = Reflect.get(focusAreaContextExtractor, 'getExtendedCodeBlockRange')
        const result = method.call(focusAreaContextExtractor, document, range, limit)

        // Assert
        checkIfExpectedRangeEqualActualRange(
            {
                start: {
                    line: 1,
                    character: 0,
                },
                end: {
                    line: 3,
                    character: 10,
                },
            },
            result
        )
    })
})
