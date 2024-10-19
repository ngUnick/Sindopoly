START TRANSACTION;

CREATE TABLE Player(
    id int AUTO_INCREMENT,
    p_name VARCHAR(255),
    email VARCHAR(255),
    PRIMARY KEY (id)
);

CREATE TABLE Game (
    id int AUTO_INCREMENT,
    gameStatus ENUM('lobby','inProgress','completed'),
    creator int,
    timer datetime,
    maxTime int,
    maxMoney int,
    winner int,
    start_Time TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (creator) REFERENCES Player(id),
    FOREIGN KEY (winner) REFERENCES Player(id)
);

CREATE TABLE Property( -- still needs to run
    id int AUTO_INCREMENT,
    price int,
    color ENUM('RED','GREEN','BLUE','YELLOW','PURPLE','ORANGE','BROWN','GRAY'),
    rent int,

    PRIMARY KEY (id)
);


CREATE TABLE Square(
    id int AUTO_INCREMENT,
    property int,
    game int,
    type ENUM('property','jail','card','start','goToJail','parking'),
    -- FOREIGN KEY (game) REFERENCES Game(id),
    FOREIGN KEY (property) REFERENCES Property(id),
    PRIMARY KEY (id)
);


CREATE TABLE Card( -- still needs to run
    id int AUTO_INCREMENT,
    description VARCHAR(1000),
    type ENUM('money','transport', 'jail'),
    amount int, -- could use TINYINT or SMALLINT

    PRIMARY KEY (id)
);

COMMIT;