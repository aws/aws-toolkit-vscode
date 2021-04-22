import os
import runpy
import sys
import re

# gives us access to debugpy's log information so we can emit a 'wait_for_client()' message
class Pipe:
    def write(self, message):
        # debugpy log messages look like this I+xxxxx.xxx: where x is a number
        # we don't want to pipe those to stderr as it will clutter the debug console
        # however, we do want to output actual errors since it is very useful for debugging
        if 'wait_for_client' in message:
            print('Debugger waiting for client...')
            self.flush()
        elif not re.search('(I|D)\+[0-9]+\.[0-9]+:', message):  
            # not a log message, print it
            print(message)

    def flush(self):
        sys.stdout.flush()

if __name__ == '__main__':
    # debugger will be available in the task root if we patched the user's requirements.txt correctly
    task_root = os.environ['LAMBDA_TASK_ROOT']
    print('Prepending Lambda task root to path: ' + task_root)
    sys.path.insert(0, task_root)
    print('Starting debugger...')
    sys.stdout.flush()

    # intercept stderr so we can process it
    sys.stderr = Pipe()

    # pretend like we invoked the debugger like: python -m <debugger_name>
    runpy.run_module('debugpy', run_name='__main__')
