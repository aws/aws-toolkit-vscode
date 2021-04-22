import os
import runpy
import sys
import re

# gives us access to debugpy's log information so we can emit a 'wait_for_client()' message
class Pipe:
    # debug mode forces all debugpy log messages through stdout
    def __init__(self, debug):
        self.debug = debug

    def write(self, message):
        # debugpy writes 'wait_for_client()' to log when it is ready for a debug adapter client to attach
        if 'wait_for_client' in message:
            print('Debugger waiting for client...')
            self.flush()
        
        # debugpy log messages look like this I+xxxxx.xxx: where x is a number we don't want to pipe those 
        # to stderr as it will clutter the debug console (unless we are in debug mode)
        # however, we do want to output actual errors without debug mode to let the user know something 
        # went wrong with starting debugpy
        if not re.search('(I|D)\+[0-9]+\.[0-9]+:', message) or self.debug:  
            sys.stdout.write(message)

    def flush(self):
        sys.stdout.flush()

if __name__ == '__main__':
    # debugger will be available in the task root if we patched the user's requirements.txt correctly
    task_root = os.environ['LAMBDA_TASK_ROOT']
    print('Prepending Lambda task root to path: ' + task_root)
    sys.path.insert(0, task_root)
    print('Starting debugger...')
    sys.stdout.flush()

    # check for '--debug' option, remove it if found since debugpy doesn't actually support it
    debuggingMode = False
    if '--debug' in sys.argv:
        debuggingMode = True
        sys.argv.remove('--debug')

    # intercept stderr so we can process it
    sys.stderr = Pipe(debuggingMode)

    # pretend like we invoked the debugger like: python -m <debugger_name>
    runpy.run_module('debugpy', run_name='__main__')
