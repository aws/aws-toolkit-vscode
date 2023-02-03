// describe('getLogContent', function () {
//     it('gets unformatted log content', function () {
//         const text = registry.getLogContent(registeredUri)

//         assert.strictEqual(
//             text,
//             `${testLogData.events[0].message}${testLogData.events[1].message}${testLogData.events[2].message}${testLogData.events[3].message}`
//         )
//     })

//     it('gets log content formatted to show timestamps', function () {
//         const text = registry.getLogContent(registeredUri, { timestamps: true })

//         assert.strictEqual(
//             text,
//             `${moment(1).format(INSIGHTS_TIMESTAMP_FORMAT)}${'\t'}${testLogData.events[0].message}${moment(
//                 2
//             ).format(INSIGHTS_TIMESTAMP_FORMAT)}${'\t'}${testLogData.events[1].message}${moment(3).format(
//                 INSIGHTS_TIMESTAMP_FORMAT
//             )}${'\t'}${testLogData.events[2].message}                             ${'\t'}${
//                 testLogData.events[3].message
//             }`
//         )
//     })

//     it('indents log entries with newlines of all flavors if timestamps are shown but otherwise does not act on them', function () {
//         const timestampText = registry.getLogContent(newLineUri, { timestamps: true })
//         const noTimestampText = registry.getLogContent(newLineUri)

//         assert.strictEqual(noTimestampText, newLineData.events[0].message)
//         assert.strictEqual(
//             timestampText,
//             `${moment(newLineData.events[0].timestamp).format(
//                 INSIGHTS_TIMESTAMP_FORMAT
//             )}${'\t'}the${'\n'}                             ${'\t'}line${'\n'}                             ${'\t'}must${'\n'}                             ${'\t'}be${'\n'}                             ${'\t'}drawn${'\n'}                             ${'\t'}HERE${'\n'}                             ${'\t'}right${'\n'}                             ${'\t'}here${'\n'}                             ${'\t'}no${'\n'}                             ${'\t'}further\n`
//         )
//     })

//     describe('setStreamIds', function () {
//         it('registers stream ids to map and clears it on document close', async function () {
//             await registry.updateLog(searchLogGroupUri)
//             registry.getLogContent(searchLogGroupUri) // We run this to create the mappings
//             const doc = await vscode.workspace.openTextDocument(searchLogGroupUri)
//             let streamIDMap = registry.getStreamIdMap(searchLogGroupUri)
//             const expectedMap = new Map<number, string>([
//                 [0, testStreamNames[0]],
//                 [1, testStreamNames[1]],
//             ])
//             assert.deepStrictEqual(streamIDMap, expectedMap)
//             registry.disposeRegistryData(doc.uri)
//             // We want to re-register log here otherwise this returns undefined.
//             registry.setLogData(searchLogGroupUri, logGroupsData)
//             streamIDMap = registry.getStreamIdMap(searchLogGroupUri)
//             assert.deepStrictEqual(streamIDMap, new Map<number, string>())
//         })

//         it('handles newlines within event messages', function () {
//             const oldData = registry.getLogData(searchLogGroupUri)
//             assert(oldData)
//             registry.setLogData(searchLogGroupUri, {
//                 ...oldData,
//                 events: [
//                     {
//                         message: 'This \n is \n a \n message \n spanning \n many \n lines',
//                         logStreamName: 'stream1',
//                     },
//                     {
//                         message: 'Here \n is \n another \n one.',
//                         logStreamName: 'stream2',
//                     },
//                     {
//                         message: 'and \n just \n one \n more',
//                         logStreamName: 'stream1',
//                     },
//                     {
//                         message: 'and thats it.',
//                         logStreamName: 'stream3',
//                     },
//                 ],
//             })
//             registry.getLogContent(searchLogGroupUri)
//             const streamIDMap = registry.getStreamIdMap(searchLogGroupUri)
//             const expectedMap = new Map<number, string>([
//                 [0, 'stream1'],
//                 [1, 'stream1'],
//                 [2, 'stream1'],
//                 [3, 'stream1'],
//                 [4, 'stream1'],
//                 [5, 'stream1'],
//                 [6, 'stream1'],
//                 [7, 'stream2'],
//                 [8, 'stream2'],
//                 [9, 'stream2'],
//                 [10, 'stream2'],
//                 [11, 'stream1'],
//                 [12, 'stream1'],
//                 [13, 'stream1'],
//                 [14, 'stream1'],
//                 [15, 'stream3'],
//             ])
//             assert.deepStrictEqual(streamIDMap, expectedMap)
//             registry.setLogData(searchLogGroupUri, oldData)
//         })
//     })
// })
