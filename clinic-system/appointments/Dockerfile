FROM golang:1.24

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN go build -o appointments

EXPOSE 8083

CMD ["./appointments"]
