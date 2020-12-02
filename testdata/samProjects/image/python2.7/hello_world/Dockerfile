FROM public.ecr.aws/lambda/python:2.7

COPY app.py requirements.txt ./

RUN curl https://bootstrap.pypa.io/get-pip.py -o get-pip.py

RUN python2.7 get-pip.py

RUN rm -rf get-pip.y

RUN python2.7 -m pip install -r requirements.txt

CMD ["app.lambda_handler"]
