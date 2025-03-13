-- NEW FUNCTIONS

DELIMITER //


-- Create a MySQL Event to Delete Expired Players (Could also be done in Spring Boot in order  to control expiration from application logic)

-- Enable the Event Scheduler in MySQL (if not already enabled):
SET GLOBAL event_scheduler = ON;


-- Then, create an event that runs every hour and deletes players older than 24 hours:
CREATE EVENT delete_expired_players
ON SCHEDULE EVERY 1 HOUR
DO
  DELETE FROM Player WHERE created_at < NOW() - INTERVAL 1 DAY;



DELIMITER ;
























-- OLD FUNCTIONS


DELIMITER //

CREATE PROCEDURE StartGame(IN gameToStart INT)
BEGIN
    DECLARE atLeast2Players BOOLEAN;
    DECLARE creator_ INT;

    select creator into creator_
    from Game
    where id = gameToStart;

    SELECT COUNT(*) >= 2 INTO atLeast2Players FROM PlayerGame WHERE game_id = gameToStart;

    IF NOT (atLeast2Players) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Should be at least 2 player to start the game';
    END IF;

    UPDATE Game SET gameStatus = 'inProgress', start_Time = NOW(), playerTurn = creator_ WHERE id = gameToStart;

END //

CREATE PROCEDURE GiveMoneyToPlayer(IN player INT,IN moneyToAdd INT)
BEGIN
	-- TODO : win condition
	
	UPDATE PlayerGame SET money = money + moneyToAdd where player_id = player;
END //

CREATE PROCEDURE RemoveMoneyToPlayer(IN player INT,IN moneyToRemove INT)
BEGIN
	-- TODO : loose condition
	
	UPDATE PlayerGame SET money = money - moneyToRemove where player_id = player;
END //
	
CREATE PROCEDURE MoneyTransactionBetweenPlayers(IN playerGiver INT,IN playerOwner INT,IN moneyToGive INT)
BEGIN
	UPDATE PlayerGame SET money = money + moneyToGive where player_id = playerOwner;
	UPDATE PlayerGame SET money = money - moneyToGive where player_id = playerGiver;
END //

CREATE PROCEDURE MovePlayerSteps(IN player INT,IN steps INT)
BEGIN
	DECLARE currentPosition INT;
	DECLARE currentGame INT;
	DECLARE target_square INT;
	DECLARE money_round INT DEFAULT 100;

	SELECT game_id INTO currentGame FROM PlayerGame WHERE player_id = player;

	SELECT square_id INTO currentPosition FROM PlayerGame WHERE player_id = player;
	SELECT position INTO currentPosition FROM Square WHERE id = currentPosition; -- refactoring
	
	SET target_square := (SELECT id from Square where game = currentGame and position = (currentPosition + steps) % 40);

	IF (currentPosition + steps) >= 40 THEN
		CALL GiveMoneyToPlayer(player,money_round);
	END IF;
	

	UPDATE PlayerGame SET square_id = target_square WHERE player_id = player;

END //



CREATE PROCEDURE MovePlayerToSquare(IN player INT,IN square INT)
BEGIN
	

END //


CREATE PROCEDURE RollDice(IN player_id INT, IN DICE1 INT,IN DICE2 INT)
BEGIN
	CALL MovePlayerSteps(player_id,DICE1 + DICE2);
END //

CREATE PROCEDURE JoinGame(IN gameToJoin INT,IN player INT)
BEGIN
    DECLARE first_square INT;
    DECLARE start_money INT DEFAULT 500;

    SET first_square := (SELECT id from Square where game = gameToJoin and position = 0);

    INSERT INTO PlayerGame (game_id,player_id,square_id,money,inJail)
    VALUES (gameToJoin,
            player,
            first_square,
            start_money,
            FALSE
    );

END //

CREATE PROCEDURE CreateGame(IN playerCreator INT,IN m_time INT,IN m_money INT)
BEGIN
    DECLARE new_game_id INT;
    DECLARE counter INT DEFAULT 1;
    DECLARE first_square INT;

    -- preconditions
    -- 1. the player can't create a game if is already creator of another game that has not been completed yet

    START TRANSACTION;

    -- create game
    INSERT INTO Game(gameStatus,creator,maxTime,maxMoney,start_Time) VALUES('lobby',playerCreator,m_time,m_money,NULL);
    SET new_game_id = LAST_INSERT_ID();

    -- create 40 squares
    

    -- Loop to insert 40 rows. THIS METHOD SHOULDN'T BE FOR LOOP BUT IT IS ONLY FOR TESTING. SHOULD BE ONE INSERT 
   /* WHILE counter <= 40 DO
        INSERT INTO Square (game,position) VALUES (new_game_id,counter);
        SET counter = counter + 1;
    END WHILE;*/

	INSERT INTO Square (game,position,property,type) VALUES 
        (new_game_id,0,null,'start'),
        (new_game_id,1,1,'property'),
        (new_game_id,2,null,'card'),
        (new_game_id,3,2,'property'),
        (new_game_id,4,null,'parking'),
        (new_game_id,5,3,'property'),
        (new_game_id,6,4,'property'),
        (new_game_id,7,null,'card'),
        (new_game_id,8,5,'property'),
        (new_game_id,9,6,'property'),
        (new_game_id,10,null,'jail'),
        (new_game_id,11,7,'property'),
        (new_game_id,12,8,'property'),
        (new_game_id,13,9,'property'),
        (new_game_id,14,10,'property'),
        (new_game_id,15,11,'property'),
        (new_game_id,16,12,'property'),
        (new_game_id,17,null,'card'),
        (new_game_id,18,13,'property'),
        (new_game_id,19,14,'property'),
        (new_game_id,20,null,'parking'),
        (new_game_id,21,15,'property'),
        (new_game_id,22,null,'card'),
        (new_game_id,23,16,'property'),
        (new_game_id,24,17,'property'),
        (new_game_id,25,18,'property'),
        (new_game_id,26,19,'property'),
        (new_game_id,27,20,'property'),
        (new_game_id,28,21,'property'),
        (new_game_id,29,22,'property'),
        (new_game_id,30,null,'goToJail'),
        (new_game_id,31,23,'property'),
        (new_game_id,32,24,'property'),
        (new_game_id,33,null,'card'),
        (new_game_id,34,25,'property'),
        (new_game_id,35,26,'property'),
        (new_game_id,36,null,'card'),
        (new_game_id,37,27,'property'),
        (new_game_id,38,null,'parking'),
        (new_game_id,39,28,'property');

    -- create playergame (participation)
    CALL JoinGame(new_game_id,playerCreator);

    COMMIT;

END //



CREATE PROCEDURE BuyProperty(IN player INT)
BEGIN
	DECLARE property_money INT;
	DECLARE game INT;
	DECLARE player_money INT;
	DECLARE property INT;

	SET property := (select Property.id from PlayerGame INNER join Square on (Square.id  = PlayerGame.square_id) INNER join Property on (Square.property = Property.id) where PlayerGame.player_id = player);
	SET property_money := (SELECT price from Property where id = property);
	SET game := (SELECT game_id from PlayerGame where player_id = player);
	SET player_money := (SELECT money from PlayerGame where player_id = player);

	IF player_money >= property_money THEN
		CALL RemoveMoneyToPlayer(player,property_money);
		INSERT INTO PlayerProperty (player,property,game) VALUES (player,property,game);
	ELSE
		SIGNAL SQLSTATE '45000'
        	SET MESSAGE_TEXT = 'Player does not have enough money to buy the property';	
    END IF;
END //



CREATE FUNCTION CanBuyProperty(Player_ INT) RETURNS INT
DETERMINISTIC
BEGIN
	DECLARE toReturn INT;
	select Property.id into toReturn
	from PlayerGame 
	INNER join Square on (Square.id  = PlayerGame.square_id)
	INNER join Property on (Square.property = Property.id) 
	where money >= price and player_id = Player_ and Property.id not in (select property from PlayerProperty where game = PlayerGame.game_id) and (Square.property is not null);
    
    RETURN toReturn;

END //

-- Create a stored procedure
CREATE PROCEDURE GetRandomCardForPlayer(IN playerId INT)
BEGIN
    DECLARE squareType VARCHAR(50);

    -- Get the square type for the specified player
    SELECT s.type INTO squareType
    FROM PlayerGame pg
    JOIN Square s ON pg.square_id = s.id
    WHERE pg.player_id = playerId;

    -- Check if the square type is 'card'
    IF squareType = 'card' THEN
        -- Get a random card and return its attributes
        SELECT *
        FROM Card
        ORDER BY RAND()
        LIMIT 1;

    ELSE
        -- Handle the case when the square type is not 'card'
        SELECT 'The square type is not a card.' AS message;
    END IF;
END //

-- If returns message, user doesnt go to Jail
CREATE PROCEDURE GoToJail(IN playerId INT)
BEGIN   
    DECLARE squareType VARCHAR(50);
    DECLARE gameThatPlay INT;
    DECLARE squareJail INT;
    
    SELECT s.type INTO squareType
    FROM PlayerGame pg
    JOIN Square s ON pg.square_id = s.id
    WHERE pg.player_id = playerId;

    SELECT game_id into gameThatPlay
    from PlayerGame
    where player_id = playerId;

    select id into squareJail
    from Square
    where (game = gameThatPlay) and (position = 10);

    IF squareType = 'goToJail' THEN
        UPDATE PlayerGame SET square_id = squareJail, inJail = 1 WHERE player_id = playerId;
        CALL RemoveMoneyToPlayer(playerId,200);
        SELECT 'Y' AS message;

    ELSE
        SELECT 'N' AS message;
    END IF;
END//

CREATE FUNCTION Rent_Money(player_rent INT) RETURNS INT
DETERMINISTIC 
BEGIN
    DECLARE my_property INT;
     DECLARE owner INT;
    DECLARE my_game INT;
    DECLARE owner_game INT;
    DECLARE my_rent INT;

   SELECT  Property into my_property
   FROM Square S
   INNER join PlayerGame P_G ON (S.id  = P_G.square_id)
   WHERE player_id = player_rent;

   SELECT Player into owner
    FROM PlayerProperty
    WHERE property = my_property;

   SELECT game_id into my_game
   FROM PlayerGame 
    WHERE player_id = player_rent;

   SELECT game_id into owner_game
   FROM PlayerGame 
    WHERE player_id = owner;

    SELECT rent INTO my_rent
    FROM Property
    WHERE id = my_property; 


    IF my_property IN (SELECT property FROM PlayerProperty)
    AND my_game = owner_game
   AND player_rent != owner
    THEN call MoneyTransactionBetweenPlayers(player_rent, OWNER, my_rent);
    RETURN my_rent;

    ELSE RETURN 0;
   END IF;



END //

CREATE PROCEDURE PassTurn(IN player INT)
BEGIN
	DECLARE current_game INT;
    DECLARE current_player_row INT;
    DECLARE next_player_id INT;
    DECLARE len_players INT;
    
    SELECT game_id into current_game
    FROM PlayerGame
    WHERE PlayerGame.player_id = player;
    
    SELECT count(*) into len_players
    FROM PlayerGame
    where PlayerGame.game_id = current_game;
    
    SELECT m.row_num into current_player_row
    FROM (Select player_id, ROW_NUMBER() OVER(ORDER BY player_id) AS row_num  
    FROM PlayerGame
    where PlayerGame.game_id = current_game) as m
    where player_id = player;
    
    SELECT m.player_id into next_player_id
    FROM (Select player_id, ROW_NUMBER() OVER(ORDER BY player_id) AS row_num  
    FROM PlayerGame
    where PlayerGame.game_id = current_game) as m
    where m.row_num = ((current_player_row + len_players) % len_players) + 1;

    update Game set playerTurn = next_player_id where id = current_game;
	
	
END //

CREATE FUNCTION MoneyUp (playerId INT) RETURNS VARCHAR(255) 
DETERMINISTIC 

BEGIN
    DECLARE money_limit INT;
    DECLARE rich_player INT;
    DECLARE rich_player_money INT;
    DECLARE game_winner VARCHAR(255);
    DECLARE gameid INT;

    SELECT game_id INTO gameid
    FROM PlayerGame
    where player_id=playerId;
    
    SELECT maxMoney INTO money_limit
    FROM Game
    WHERE id = gameid;
	   
    
	 SELECT player_id INTO rich_player
    FROM PlayerGame 
    WHERE money = (SELECT MAX(money) FROM PlayerGame WHERE game_id = gameid)
	 LIMIT 1;  
    
    SELECT money INTO rich_player_money
    FROM PlayerGame 
    WHERE game_id = gameid AND player_id = rich_player;
    
    SELECT p_name INTO game_winner
    FROM Player 
	 WHERE id = rich_player;

    IF  rich_player_money >= money_limit
    THEN
        UPDATE Game
        SET gameStatus = 3, winner = rich_player
        WHERE id = gameid;
        
        RETURN game_winner;
        
        ELSE RETURN 'no_winner';
    END IF;   
END //  


CREATE FUNCTION MoneyDown (playerId INT) RETURNS VARCHAR(255) 
DETERMINISTIC 

BEGIN
    DECLARE poor_player_money INT;
    DECLARE rich_player INT;
    DECLARE rich_player_money INT;
    DECLARE game_winner VARCHAR(255);
    DECLARE gameid INT;

    SELECT game_id INTO gameid
    FROM PlayerGame
    where player_id=playerId;
    
    SELECT money INTO poor_player_money
    FROM PlayerGame 
    WHERE money = (SELECT MIN(money) FROM PlayerGame WHERE game_id = gameid)
	 LIMIT 1;
    
	 SELECT player_id INTO rich_player
    FROM PlayerGame 
    WHERE money = (SELECT MAX(money) FROM PlayerGame WHERE game_id = gameid)
	 LIMIT 1;  
    
    SELECT money INTO rich_player_money
    FROM PlayerGame 
    WHERE game_id = gameid AND player_id = rich_player;
    
    SELECT p_name INTO game_winner
    FROM Player 
	 WHERE id = rich_player;

    IF  poor_player_money < 0
    THEN
        UPDATE Game
        SET gameStatus = 3, winner = rich_player
        WHERE id = gameid;
        
         RETURN game_winner;
        
        ELSE RETURN 'no_winner';
    END IF;     
END //  


CREATE FUNCTION TimeUp (playerId INT) RETURNS VARCHAR(255) 
DETERMINISTIC 

BEGIN
    DECLARE time_up TIMESTAMP;
    DECLARE game_start TIMESTAMP;
    DECLARE game_duration INT;
    DECLARE rich_player INT;
    DECLARE game_winner VARCHAR(255);
    DECLARE gameid INT;

    SELECT game_id INTO gameid
    FROM PlayerGame
    where player_id=playerId;
    
    SELECT start_time INTO game_start
    FROM Game
    WHERE id = gameid;

    SELECT maxTime INTO game_duration
    FROM Game
    WHERE id = gameid;

    SELECT player_id INTO rich_player
    FROM PlayerGame 
    WHERE money = (SELECT MAX(money) FROM PlayerGame WHERE game_id = gameid)
	 LIMIT 1;
    
    SELECT p_name INTO game_winner
    FROM Player 
    WHERE id = rich_player;

    SET time_up = DATE_ADD(game_start, INTERVAL game_duration MINUTE);

    IF NOW() > time_up  
    THEN
        UPDATE Game
        SET gameStatus = 3, winner = rich_player
        WHERE id = gameid;
        
        RETURN game_winner;
        
        ELSE RETURN 'no_winner';
    END IF;     
END //   

-- CREATE TRIGGER after_update_GameStatus
-- AFTER UPDATE ON Game
-- FOR EACH ROW
-- BEGIN
--     IF NEW.GameStatus = 'completed' AND OLD.GameStatus = 'inProgress' THEN
--         do SLEEP(10);
--         DELETE FROM PlayerGame WHERE game_id = NEW.id; 
--     END IF;
-- END;

-- //



CREATE PROCEDURE EndGame(IN player INT)
BEGIN
	DECLARE current_game INT;
    
    SELECT game_id into current_game
    FROM PlayerGame
    WHERE PlayerGame.player_id = player;
    
    DELETE FROM PlayerGame WHERE game_id = current_game;
    DELETE FROM Square WHERE game = current_game;
    DELETE FROM PlayerProperty WHERE game = current_game;
END //



CREATE PROCEDURE GetProperties(IN player INT)
BEGIN
    DECLARE current_game INT;

    SELECT game_id INTO current_game
    FROM PlayerGame
    WHERE PlayerGame.player_id = player;

    SELECT GROUP_CONCAT(s.position) as Properties
    FROM PlayerProperty as pp INNER JOIN Square s on s.property = pp.property
    WHERE pp.game = current_game and pp.player = player
    GROUP BY pp.player, pp.game;

END //



CREATE PROCEDURE CreateGameBot(IN playerCreator INT,IN m_time INT,IN m_money INT)
BEGIN
    DECLARE current_game INT;
    
	CALL CreateGame(playerCreator,m_time,m_money);

    SELECT game_id into current_game
    FROM PlayerGame
    WHERE PlayerGame.player_id = playerCreator;

    CALL JoinGame(current_game,5);

    CALL StartGame(current_game);

END //


DELIMITER ;