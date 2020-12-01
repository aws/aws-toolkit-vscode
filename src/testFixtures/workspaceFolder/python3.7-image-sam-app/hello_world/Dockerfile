FROM 628053151772.dkr.ecr.sa-east-1.amazonaws.com/awslambda/python3.7-runtime:beta

COPY app.py requirements.txt ./

RUN python3.7 -m pip install -r requirements.txt

# Command can be overwritten by providing a different command in the template directly.
CMD ["app.lambda_handler"]