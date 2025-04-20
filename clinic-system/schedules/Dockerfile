FROM golang:1.24

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN go build -o schedules

EXPOSE 8082

CMD ["./schedules"]
