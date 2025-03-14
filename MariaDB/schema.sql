-- NEW TABLES

START TRANSACTION;

CREATE TABLE Player(
    id INT AUTO_INCREMENT,
    p_name VARCHAR(255),

    -- will see later if this is needed, depending on if I add a login system
    -- email VARCHAR(255),

    -- store the timestamp when a player is created, in order to delete them after 1 day
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);


CREATE TABLE Card(
    id SMALLINT AUTO_INCREMENT,
    title VARCHAR(200),
    description VARCHAR(1000),
    type ENUM('money','transport'),
    amount FLOAT, -- if 'money' then amount is the money (negative if the player has to pay), if 'transport' then amount is the position
    PRIMARY KEY (id)
);


CREATE TABLE Square(
    id TINYINT AUTO_INCREMENT,
    s_type ENUM('START', 'CARD', 'TAX', 'JAIL', 'GOJAIL', 'PARKING', 'TRAIN', 'UTILITY', 'BROWN', 'CYAN', 'PURPLE', 'ORANGE', 'RED', 'YELLOW', 'GREEN','BLUE'),
    price SMALLINT,
    rent SMALLINT,

    PRIMARY KEY (id)
);

CREATE TABLE Stats( -- not sure if it will implemented yet
    id INT AUTO_INCREMENT,
    player INT,
    total_wins INT DEFAULT 0,
    total_losses INT DEFAULT 0,
    total_games INT DEFAULT 0,
    total_money INT DEFAULT 0,
    total_time_played INT DEFAULT 0,
    PRIMARY KEY (id),
    FOREIGN KEY (player) REFERENCES Player(id)
);

COMMIT;


















-- OLD TABLES

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
    playerTurn int,
    timer datetime,
    maxTime int,
    maxMoney int,
    winner int,
    start_Time TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (creator) REFERENCES Player(id),
    FOREIGN KEY (winner) REFERENCES Player(id),
    CONSTRAINT CHK_playerTurn CHECK (playerTurn >=1 AND playerTurn <= 4)
);

CREATE TABLE Property(
    id int AUTO_INCREMENT,
    price int,
    color ENUM('RED','GREEN','BLUE','YELLOW','PURPLE','ORANGE','BROWN','GRAY'),
    rent int,

    PRIMARY KEY (id)
);


CREATE TABLE Square(
    id int AUTO_INCREMENT,
    game int,
    position int,
    property int,
    type ENUM('property','jail','card','start','goToJail','parking'),
    FOREIGN KEY (game) REFERENCES Game(id),
    FOREIGN KEY (property) REFERENCES Property(id),
    PRIMARY KEY (id)
);

CREATE TABLE PlayerGame( -- the game corispondent rows would be removed once the game finished
    game_id int,
    player_id int,
    square_id int,
    money int,
    inJail boolean,

    PRIMARY KEY (player_id),
    FOREIGN KEY (game_id) REFERENCES Game(id),
    FOREIGN KEY (player_id) REFERENCES Player(id),
    FOREIGN KEY (square_id) REFERENCES Square(id)
);

CREATE TABLE PlayerProperty(
    player int,
    property int,
    game int,

    FOREIGN KEY (player) REFERENCES Player(id),
    FOREIGN KEY (property) REFERENCES Property(id),
    FOREIGN KEY (game) REFERENCES Game(id),
    PRIMARY KEY (property,game)
);


CREATE TABLE Card(
    id int AUTO_INCREMENT,
    title VARCHAR(200),
    description VARCHAR(1000),
    type ENUM('money','transport'),
    amount int,

    PRIMARY KEY (id)
);

COMMIT;