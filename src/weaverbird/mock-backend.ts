/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
// eslint-disable @typescript-eslint/restrict-template-expressions
import { ChatItem, ChatPrompt, Suggestion } from '@aws/mynah-ui-chat'
import { ChatItemType } from './models'

const streamDelay = 150

// Those are sample datas we have here
// But they can also help you understand what kind of data mynah-ui is expecting to produce view elements
const sampleReferences = (prompt: ChatPrompt): Suggestion[] => [
    {
        url: 'https://stackoverflow.com/questions/55297041',
        title: `Related content 1 ${prompt.prompt}`,
        body: '<p>This is the body of the related content one.</p>',
    },
    {
        url: 'https://github.com/mynah/mynah',
        title: `Related content 2 ${prompt.prompt}`,
        body: '<pre><code>let a = 1;\nconsole.log(a + a + a);</code></pre>',
    },
    {
        url: 'https://stackoverflow.com/questions/55297050',
        title: `Related content 1 ${prompt.prompt}`,
        body: '<p>This is the body of the related content one.</p>',
    },
    {
        url: 'https://stackoverflow.com/questions/55297051',
        title: `Related content 1 ${prompt.prompt}`,
        body: '<p>This is the body of the related content one.</p>',
    },
]
const sampleFollowups = (prompt: ChatPrompt): Array<{ pillText: string; prompt: string }> => [
    {
        pillText: 'See alternatives',
        prompt: `Ok, can you show me some alternatives for "${prompt.prompt}"?`,
    },
    {
        pillText: 'Best practices',
        prompt: 'Can you show me some best practices to write efficient javascript code?',
    },
    {
        pillText: 'Improvements',
        prompt: `Can you improve "${prompt.prompt}" for me?`,
    },
]

// This is completely dummy and to mock a data return.
// You should implement your own data handling solution instead of this
export class MockBackend {
    private static instance: MockBackend

    public requestGenerativeAIAnswer = async (
        prompt: ChatPrompt,
        onAnswer: (answer: ChatItem) => void,
        onAnswerStream: (answerStream: string) => void
    ): Promise<boolean> => {
        // Initially we're returning a ChatItem here immediately, which has the type ANSWER_STREAM
        // This will allow us to send some stream afterwards after generating a stream card.
        // When you send another ChatItem, this stream will be closed.
        // The new one can also be a stream, which means that it will start to get the upcoming streams.
        let answerMarkDown: string = `### You've asked for "${prompt.prompt}"`
        onAnswer({
            type: ChatItemType.ANSWER_STREAM,
            body: `<span markdown="1">${answerMarkDown}</span>`,
        })

        // Lets finalize the stream with a reference lins (citation)
        // If you want to see a preview of this citation when you hover,
        // At anytime, you should provide a reference or a suggestion with the same url
        // One of the sample references we're using has the exact same url
        answerMarkDown += '\n\r[Reference Link](https://stackoverflow.com/questions/55297050)'
        onAnswerStream(`<span markdown="1">${answerMarkDown}</span>`)

        setTimeout(() => {
            // Now lets add some references.
            // As i've said above, since we have a reference has the same url with the above citation
            // Both will show up a preview card when you hover.
            // Another important thing here that you don't have any kind of connection inside a webview extension
            // So your suggestion object you use as a reference should contain a body
            // to let it show a body inside the preview card
            onAnswer({
                type: ChatItemType.ANSWER,
                relatedContent: {
                    title: 'References',
                    content: sampleReferences(prompt),
                },
            })

            setTimeout(() => {
                // Now send some other references
                // to showcase another way of representing references.
                // This one is showing them vertically
                // But works exactly same way with the references.
                // This one will show only 3 items initially,
                // if you have more than 3 items (which you can add infinite number of them),
                // there will be a "Show more" button which will expand them wrapper to show all of them.
                onAnswer({
                    type: ChatItemType.ANSWER,
                    suggestions: {
                        title: 'References (2nd viewing option)',
                        suggestions: sampleReferences(prompt),
                    },
                })
                setTimeout(() => {
                    // Finally add some followup options
                    // Format is pretty straight forwards.
                    onAnswer({
                        type: ChatItemType.ANSWER,
                        followUp: {
                            text: 'Followup options',
                            options: sampleFollowups(prompt),
                        },
                    })

                    // OK, we've used all kind of data we can show in chat window.
                    // But you don't have to send them one by one.
                    // You can combine all of them at the same time.
                    // You can also add a prompt (which will show up on the right) by changing the type to PROMPT
                    // Usually we're combining the followups and the references together.
                }, streamDelay)
            }, streamDelay)
        }, streamDelay)

        // It returns a promise and acts like an async function just to use await inside
        // You don't needs these kind of weirdness on your implementation
        return await new Promise(resolve => {
            resolve(true)
        })
    }

    // Instead of creating multiple Connector
    // if you need to use it in multiple locations
    // and instead of passing the reference of it
    // just getting the instance all the time
    public static getInstance(): MockBackend {
        if (MockBackend.instance === undefined) {
            MockBackend.instance = new MockBackend()
        }

        return MockBackend.instance
    }
}
