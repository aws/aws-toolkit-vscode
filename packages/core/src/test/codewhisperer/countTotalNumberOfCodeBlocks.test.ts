/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { Messenger } from '../../codewhispererChat/controllers/chat/messenger/messenger'
import { CWCTelemetryHelper } from '../../codewhispererChat/controllers/chat/telemetryHelper'
import { performanceTest } from '../../shared/performance/performance'
import { AppToWebViewMessageDispatcher } from '../../codewhispererChat/view/connector/connector'

// 10 code blocks
const longMessage =
    'Sure, here are some good code samples to know across different languages and concepts:1. **Python**```python# List Comprehensionsquares = [x**2 for x in range(10)]  # [0, 1, 4, 9, 16, 25, 36, 49, 64, 81]# Lambda Functionsdouble = lambda x: x * 2print(double(5))  # Output: 10```2. **JavaScript**```javascript// Arrow Functionsconst double = x =&gt; x * 2;console.log(double(5)); // Output: 10// Array Methodsconst numbers = [1, 2, 3, 4, 5];const doubledNumbers = numbers.map(num =&gt; num * 2); // [2, 4, 6, 8, 10]```3. **Java**```java// StreamsList&lt;Integer&gt; numbers = Arrays.asList(1, 2, 3, 4, 5);List&lt;Integer&gt; doubledNumbers = numbers.stream()                                      .map(n -&gt; n * 2)                                      .collect(Collectors.toList());// doubledNumbers = [2, 4, 6, 8, 10]```4. **C#**```csharp// LINQvar numbers = new List&lt;int&gt; { 1, 2, 3, 4, 5 };var doubledNumbers = numbers.Select(n =&gt; n * 2); // { 2, 4, 6, 8, 10 }```5. **Ruby**```ruby# Block Syntaxdoubled_numbers = [1, 2, 3, 4, 5].map { |n| n * 2 } # [2, 4, 6, 8, 10]```6. **SQL**```sql-- SubqueriesSELECT name, (SELECT COUNT(*) FROM orders WHERE orders.customer_id = customers.id) AS order_countFROM customers;```7. **Regular Expressions**```javascript// JavaScriptconst pattern = /\\b\\w*@\\w*\\.\\w{2,}\\b/g;// emailAddresses = ["john@example.com", "jane@example.org"]```8. **Recursion**```python# Pythondef factorial(n):    if n == 0:        return 1    else:        return n * factorial(n-1)print(factorial(5))  # Output: 120```9. **Multithreading**```java// Javapublic class MyRunnable implements Runnable {    public void run() {        // Code to be executed in a separate thread    }}Thread myThread = new Thread(new MyRunnable());myThread.start();```10. **Error Handling**```javascript// JavaScripttry {    // Code that might throw an error} catch (error) {    console.error(error.message);} finally {    // Code that will always execute}```These are just a few examples of good code samples to know across different languages and concepts. They cover topics like functional programming, data manipulation, regular expressions, recursion, concurrency, and error handling.'
// 5 code blocks
const mediumMessage =
    'Certainly! Here are 5 more code examples covering different concepts and languages:1. **Python Decorators**```pythondef timer(func):    import time    def wrapper(*args, **kwargs):        start = time.time()        result = func(*args, **kwargs)        end = time.time()        print(f"{func.__name__} ran in {end - start:.2f} seconds")        return result    return wrapper@timerdef slow_function():    import time    time.sleep(2)slow_function()  # Output: slow_function ran in 2.00 seconds```2. **JavaScript Promises and Async/Await**```javascriptfunction fetchData() {    return new Promise((resolve, reject) =&gt; {        setTimeout(() =&gt; resolve("Data fetched"), 2000);    });}async function getData() {    try {        console.log("Fetching data...");        const result = await fetchData();        console.log(result);    } catch (error) {        console.error("Error:", error);    }}getData();// Output:// Fetching data...// Data fetched (after 2 seconds)```3. **C++ Templates**```cpp#include &lt;iostream&gt;#include &lt;vector&gt;template&lt;typename T&gt;T sum(const std::vector&lt;T&gt;&amp; vec) {    T total = 0;    for (const auto&amp; item : vec) {        total += item;    }    return total;}int main() {    std::vector&lt;int&gt; intVec = {1, 2, 3, 4, 5};    std::vector&lt;double&gt; doubleVec = {1.1, 2.2, 3.3, 4.4, 5.5};    std::cout &lt;&lt; "Sum of integers: " &lt;&lt; sum(intVec) &lt;&lt; std::endl;    std::cout &lt;&lt; "Sum of doubles: " &lt;&lt; sum(doubleVec) &lt;&lt; std::endl;    return 0;}```4. **Go Goroutines and Channels**```gopackage mainimport (    "fmt"    "time")func worker(id int, jobs &lt;-chan int, results chan&lt;- int) {    for j := range jobs {        fmt.Println("worker", id, "started job", j)        time.Sleep(time.Second)        fmt.Println("worker", id, "finished job", j)        results &lt;- j * 2    }}func main() {    jobs := make(chan int, 100)    results := make(chan int, 100)    for w := 1; w &lt;= 3; w++ {        go worker(w, jobs, results)    }    for j := 1; j &lt;= 5; j++ {        jobs &lt;- j    }    close(jobs)    for a := 1; a &lt;= 5; a++ {        &lt;-results    }}```5. **Rust Ownership and Borrowing**```rustfn main() {    let s1 = String::from("hello");        let len = calculate_length(&amp;s1);    println!("The length of \'{}\' is {}.", s1, len);}fn calculate_length(s: &amp;String) -&gt; usize {    s.len()}```These examples showcase more advanced concepts like decorators in Python, asynchronous programming in JavaScript, templates in C++, concurrency in Go, and Rust\'s ownership system. Each of these concepts is fundamental to their respective languages and can greatly enhance your programming capabilities.'
// 2 code blocks
const shortMessage =
    "Certainly! Here are two more code examples that demonstrate useful concepts:\n\n1. **Python Context Managers**\n\nContext managers are a powerful feature in Python for resource management. They ensure that resources are properly acquired and released, even if exceptions occur.\n\n```python\nimport contextlib\n\n@contextlib.contextmanager\ndef file_manager(filename, mode):\n    try:\n        f = open(filename, mode)\n        yield f\n    finally:\n        f.close()\n\n# Using the context manager\nwith file_manager('example.txt', 'w') as file:\n    file.write('Hello, World!')\n\n# The file is automatically closed after the with block, even if an exception occurs\n```\n\nThis example demonstrates how to create and use a custom context manager. It's particularly useful for managing resources like file handles, network connections, or database transactions.\n\n2. **JavaScript Closures**\n\nClosures are a fundamental concept in JavaScript that allows a function to access variables from its outer (enclosing) lexical scope even after the outer function has returned.\n\n```javascript\nfunction createCounter() {\n    let count = 0;\n    return function() {\n        count += 1;\n        return count;\n    }\n}\n\nconst counter = createCounter();\nconsole.log(counter()); // Output: 1\nconsole.log(counter()); // Output: 2\nconsole.log(counter()); // Output: 3\n\nconst counter2 = createCounter();\nconsole.log(counter2()); // Output: 1\n```\n\nIn this example, the `createCounter` function returns an inner function that has access to the `count` variable in its closure. Each time you call `createCounter()`, it creates a new closure with its own `count` variable. This is a powerful pattern for creating private state in JavaScript.\n\nThese examples demonstrate important programming concepts that are widely used in real-world applications. Context managers in Python help with resource management, while closures in JavaScript are crucial for understanding scope and creating private state."

function performanceTestWrapper(label: string, message: string, expectedCount: number) {
    return performanceTest(
        {
            testRuns: 1,
            linux: {
                userCpuUsage: 180,
                systemCpuUsage: 35,
                heapTotal: 4,
            },
            darwin: {
                userCpuUsage: 180,
                systemCpuUsage: 35,
                heapTotal: 4,
            },
            win32: {
                userCpuUsage: 180,
                systemCpuUsage: 35,
                heapTotal: 4,
            },
        },
        label,
        function () {
            return {
                setup: async () => {
                    const messenger = new Messenger({} as AppToWebViewMessageDispatcher, {} as CWCTelemetryHelper)
                    return messenger
                },
                execute: async (messenger: Messenger) => {
                    return await messenger.countTotalNumberOfCodeBlocks(message)
                },
                verify: async (_messenger: Messenger, result: number) => {
                    assert.strictEqual(result, expectedCount)
                },
            }
        }
    )
}

describe('countTableNumberOfCodeBlocks', function () {
    describe('performance tests', function () {
        performanceTestWrapper('short', shortMessage, 2)
        performanceTestWrapper('medium', mediumMessage, 5)
        performanceTestWrapper('long', longMessage, 10)
    })
})
