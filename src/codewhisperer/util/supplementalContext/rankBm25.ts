/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// Implementation inspired by https://github.com/dorianbrown/rank_bm25/blob/990470ebbe6b28c18216fd1a8b18fe7446237dd6/rank_bm25.py#L52

export interface BMDocument {
    /** The document is originally scoreed. */
    index: number
    /** The score that the document recieves. */
    score: number
}

export function performBM25Scoring(corpusList: string[], query: string): BMDocument[] {
    const wordFrequency: WordFrequency = initialize(corpusList)
    const idf: IDF = calcIdf(wordFrequency)
    const scoredDocs: BMDocument[] = getScore(wordFrequency, idf, query)
    // Sort the result in descending order of scores.
    return scoredDocs.sort((a: BMDocument, b: BMDocument) => b.score - a.score)
}

interface FrequencyMap {
    [word: string]: number
}

interface WordFrequency {
    docLen: number[]
    docFreqs: FrequencyMap[]
    corpusSize: number
    avgDl: number
    nd: FrequencyMap
}

interface IDFMap {
    [word: string]: number
}

interface IDF {
    idf: IDFMap
    averageIdf: number
}

const BM25Configs = {
    epsilon: 0.25,
    k1: 1.5,
    b: 0.75,
}

// TODO: This is a very simple tokenizer, we want to replace this by more sophisticated one.
function tokenize(content: string): string[] {
    const regex = /\w+/g
    const words = content.split(' ')
    const result = []
    for (const word of words) {
        const wordList = findAll(word, regex)
        result.push(...wordList)
    }

    return result
}

function initialize(corpus: string[]): WordFrequency {
    const docLen: number[] = []
    const docFreqs: FrequencyMap[] = []
    const nd: FrequencyMap = {}
    let numDoc = 0
    let corpusSize = 0

    corpus.forEach(document => {
        //TODO: Replace this simple split by better tokenizer
        const words = tokenize(document)
        docLen.push(words.length)
        numDoc += words.length

        const frequencies: FrequencyMap = {}
        words.forEach(word => {
            frequencies[word] = (frequencies[word] || 0) + 1
        })
        docFreqs.push(frequencies)

        for (const word in frequencies) {
            nd[word] = (nd[word] || 0) + 1
        }

        corpusSize += 1
    })

    const avgDl = numDoc / corpusSize
    return { docLen, docFreqs, corpusSize, avgDl, nd }
}

function calcIdf(wordFrequency: WordFrequency): IDF {
    const idf: IDFMap = {}
    let idfSum = 0
    const negativeIdfs: string[] = []
    const nd = wordFrequency['nd']
    const corpusSize = wordFrequency['corpusSize']

    for (const word in nd) {
        const freq = nd[word]
        const idfValue = Math.log(corpusSize - freq + 0.5) - Math.log(freq + 0.5)
        idf[word] = idfValue
        idfSum += idfValue

        if (idfValue < 0) {
            negativeIdfs.push(word)
        }
    }

    const averageIdf = idfSum / Object.keys(idf).length
    const eps = BM25Configs['epsilon'] * averageIdf

    negativeIdfs.forEach(word => {
        idf[word] = eps
    })

    return { idf, averageIdf }
}

function getScore(wordFrequency: WordFrequency, idf: IDF, query: string) {
    return wordFrequency.docFreqs.map((docFreq, index) => {
        const queryWords = tokenize(query)
        const score = queryWords
            .map((queryWord: string) => {
                const queryWordFreqForDocument = docFreq[queryWord] || 0
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                return (
                    ((idf.idf[queryWord] || 0.0) * queryWordFreqForDocument * (BM25Configs.k1 + 1)) /
                    (queryWordFreqForDocument +
                        BM25Configs.k1 *
                            (1 -
                                BM25Configs.b +
                                (BM25Configs.b * wordFrequency['docLen'][index]) / wordFrequency['avgDl']))
                )
            }, 0.0)
            .reduce((a: number, b: number) => a + b, 0)

        return { index, score } as BMDocument
    })
}

function findAll(str: string, re: RegExp): string[] {
    let match: RegExpExecArray | null
    const matches: string[] = []

    // eslint-disable-next-line no-null/no-null
    while ((match = re.exec(str)) !== null) {
        matches.push(match[0])
    }

    return matches
}
