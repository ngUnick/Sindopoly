-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: db
-- Creato il: Gen 11, 2024 alle 07:22
-- Versione del server: 8.2.0
-- Versione PHP: 8.2.8

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `monopoly`
--

DELIMITER $$
--
-- Procedure
--
CREATE DEFINER=`root`@`localhost` PROCEDURE `BuyProperty` (IN `player` INT)   BEGIN
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
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `CreateGame` (IN `playerCreator` INT, IN `m_time` INT, IN `m_money` INT)   BEGIN
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
		(new_game_id,4,null,'card'),
		(new_game_id,5,null,'card'),
		(new_game_id,6,3,'property'),
		(new_game_id,7,null,'card'),
		(new_game_id,8,4,'property'),
		(new_game_id,9,5,'property'),
		(new_game_id,10,null,'jail'),
		(new_game_id,11,6,'property'),
		(new_game_id,12,null,'card'),
		(new_game_id,13,7,'property'),
		(new_game_id,14,8,'property'),
		(new_game_id,15,null,'card'),
		(new_game_id,16,9,'property'),
		(new_game_id,17,null,'card'),
		(new_game_id,18,10,'property'),
		(new_game_id,19,11,'property'),
		(new_game_id,20,null,'parking'),
		(new_game_id,21,12,'property'),
		(new_game_id,22,null,'card'),
		(new_game_id,23,13,'property'),
		(new_game_id,24,14,'property'),
		(new_game_id,25,null,'card'),
		(new_game_id,26,15,'property'),
		(new_game_id,27,16,'property'),
		(new_game_id,28,null,'card'),
		(new_game_id,29,17,'property'),
		(new_game_id,30,null,'goToJail'),
		(new_game_id,31,18,'property'),
		(new_game_id,32,19,'property'),
		(new_game_id,33,null,'card'),
		(new_game_id,34,20,'property'),
		(new_game_id,35,null,'card'),
		(new_game_id,36,null,'card'),
		(new_game_id,37,21,'property'),
		(new_game_id,38,null,'card'),
		(new_game_id,39,22,'property');

    -- create playergame (participation)
    CALL JoinGame(new_game_id,playerCreator);

    COMMIT;

END$$

CREATE DEFINER=`root`@`%` PROCEDURE `CreateGameBot` (IN `playerCreator` INT, IN `m_time` INT, IN `m_money` INT)   BEGIN
    DECLARE current_game INT;
    
	CALL CreateGame(playerCreator,m_time,m_money);

    SELECT game_id into current_game
    FROM PlayerGame
    WHERE PlayerGame.player_id = playerCreator;

    CALL JoinGame(current_game,5);

    CALL StartGame(current_game);

END$$

CREATE DEFINER=`root`@`%` PROCEDURE `EndGame` (IN `player` INT)   BEGIN
	DECLARE current_game INT;
    
    SELECT game_id into current_game
    FROM PlayerGame
    WHERE PlayerGame.player_id = player;
    
    DELETE FROM PlayerGame WHERE game_id = current_game;
    DELETE FROM Square WHERE game = current_game;
    DELETE FROM PlayerProperty WHERE game = current_game;
END$$

CREATE DEFINER=`root`@`%` PROCEDURE `GetProperties` (IN `player` INT)   BEGIN
    DECLARE current_game INT;

    SELECT game_id INTO current_game
    FROM PlayerGame
    WHERE PlayerGame.player_id = player;

    SELECT GROUP_CONCAT(s.position) as Properties
    FROM PlayerProperty as pp INNER JOIN Square s on s.property = pp.property
    WHERE pp.game = current_game and pp.player = player
    GROUP BY pp.player, pp.game;

END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `GetRandomCardForPlayer` (IN `playerId` INT)   BEGIN
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
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `GiveMoneyToPlayer` (IN `player` INT, IN `moneyToAdd` INT)   BEGIN
	-- TODO : win condition
	
	UPDATE PlayerGame SET money = money + moneyToAdd where player_id = player;
END$$

CREATE DEFINER=`root`@`%` PROCEDURE `GoToJail` (IN `playerId` INT)   BEGIN   
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
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `JoinGame` (IN `gameToJoin` INT, IN `player` INT)   BEGIN
    DECLARE first_square INT;
    DECLARE start_money INT DEFAULT 500;

    SET first_square := (SELECT id from Square where game = gameToJoin and position = 1);

    INSERT INTO PlayerGame (game_id,player_id,square_id,money,inJail)
    VALUES (gameToJoin,
            player,
            first_square,
            start_money,
            FALSE
    );

END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `MoneyTransactionBetweenPlayers` (IN `playerGiver` INT, IN `playerOwner` INT, IN `moneyToGive` INT)   BEGIN
	UPDATE PlayerGame SET money = money + moneyToGive where player_id = playerOwner;
	UPDATE PlayerGame SET money = money - moneyToGive where player_id = playerGiver;
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `MovePlayerSteps` (IN `player` INT, IN `steps` INT)   BEGIN
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

END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `MovePlayerToSquare` (IN `player` INT, IN `square` INT)   BEGIN
	

END$$

CREATE DEFINER=`root`@`%` PROCEDURE `PassTurn` (IN `player` INT)   BEGIN
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
	
	
END$$

CREATE DEFINER=`root`@`%` PROCEDURE `PassTurn2` (IN `player` INT)   BEGIN
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

    select next_player_id as 'output';
	
	
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `RemoveMoneyToPlayer` (IN `player` INT, IN `moneyToRemove` INT)   BEGIN
	-- TODO : loose condition
	
	UPDATE PlayerGame SET money = money - moneyToRemove where player_id = player;
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `RollDice` (IN `player_id` INT, IN `DICE1` INT, IN `DICE2` INT)   BEGIN
	CALL MovePlayerSteps(player_id,DICE1 + DICE2);
END$$

CREATE DEFINER=`root`@`localhost` PROCEDURE `StartGame` (IN `gameToStart` INT)   BEGIN
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

END$$

--
-- Funzioni
--
CREATE DEFINER=`root`@`localhost` FUNCTION `CanBuyProperty` (`Player_` INT) RETURNS INT DETERMINISTIC BEGIN
	DECLARE toReturn INT;
	select Property.id into toReturn
	from PlayerGame 
	INNER join Square on (Square.id  = PlayerGame.square_id)
	INNER join Property on (Square.property = Property.id) 
	where money >= price and player_id = Player_ and Property.id not in (select property from PlayerProperty where game = PlayerGame.game_id) and (Square.property is not null);
    
    RETURN toReturn;

END$$

CREATE DEFINER=`root`@`%` FUNCTION `MoneyDown` (`playerId` INT) RETURNS VARCHAR(255) CHARSET utf8mb4 DETERMINISTIC BEGIN
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
END$$

CREATE DEFINER=`root`@`%` FUNCTION `MoneyUp` (`playerId` INT) RETURNS VARCHAR(255) CHARSET utf8mb4 DETERMINISTIC BEGIN
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
END$$

CREATE DEFINER=`root`@`%` FUNCTION `Rent_Money` (`player_rent` INT) RETURNS INT DETERMINISTIC BEGIN
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



END$$

CREATE DEFINER=`root`@`%` FUNCTION `TimeUp` (`playerId` INT) RETURNS VARCHAR(255) CHARSET utf8mb4 DETERMINISTIC BEGIN
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
END$$

DELIMITER ;

-- --------------------------------------------------------

--
-- Struttura della tabella `Card`
--

CREATE TABLE `Card` (
  `id` int NOT NULL,
  `title` varchar(200) DEFAULT NULL,
  `description` varchar(1000) DEFAULT NULL,
  `type` enum('money','transport') DEFAULT NULL,
  `amount` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dump dei dati per la tabella `Card`
--

INSERT INTO `Card` (`id`, `title`, `description`, `type`, `amount`) VALUES
(1, 'Go', 'Ο φίλος σου που έχει αμάξι έφυγε πιο νωρίς σήμερα. Πήγαινε στην στάση «ΙΘΑΚΗ» να πάρεις το 52.', 'transport', 8),
(2, 'Go', 'Ακυρώθηκε το εργαστήριο σου και δεν έχεις τί να κάνεις. Πήγαινε στο ΣΠΛΑΣ.', 'transport', 2),
(3, 'Go', 'Πήγαινε στο ΤΜΗΜΑ ΗΛΕΚΤΡΟΝΙΚΗΣ.', 'transport', 3),
(4, 'Go', 'Έχεις 3 ώρες κενό μέχρι το επόμενο μάθημα. Πήγαινε στο ΚΥΛΙΚΕΙΟ.', 'transport', 7),
(5, 'Go', 'Πήγες να κάνεις «Αλληλεπίδραση Ανθεώπου-Μηχανής» αλλά άργησες και δεν είχε θέση να καθίσεις. Πήγαινε στην ΒΙΒΛΙΟΘΗΚΗ.', 'transport', 9),
(6, 'Go', 'Έχεις 3 ώρες κενό μέχρι το επόμενο μάθημα. Πήγαίνε στο ΓΥΜΝΑΣΤΗΡΙΟ.', 'transport', 10),
(7, 'Go', 'Ήρθες χωρίς μάσκα για μάθημα. Πήγαινε στο ΚΥΛΙΚΕΙΟ. Αν περάσεις από την ΑΦΕΤΗΡΙΑ, μην πάρεις λεφτά.', 'transport', 4),
(8, 'Go', 'Κόπηκες στην πρόοδο των «Ηλεκτρονικών Κυκλωμάτων». Πήγαινε στην ΒΙΒΛΙΟΘΗΚΗ. Αν περάσεις από την ΑΦΕΤΗΡΙΑ, μην πάρεις λεφτά.', 'transport', 7),
(9, 'Go', 'Χώρισες με την κοπέλα σου και θέλεις να κάνεις γνωριμίες. Πήγαινε στο ΚΙΟΣΚΙ Σ.Ε.Υ.Π.', 'transport', 5),
(10, 'Go', 'Χώρισες με το αγόρι σου και θέλεις να κάνεις γνωριμίες. Πήγαινε στο ΚΙΟΣΚΙ ΠΛΗΡΟΦΟΡΙΚΗΣ.', 'transport', 2),
(11, 'Go', 'Η στάση του ΔΙ.ΠΑ.Ε. είναι γεμάτη. Περπάτα μέχρι την ΣΤΑΣΗ ΤΕΡΜΑΤΙΚΟΥ και ίσως καταφέρεις να μπεις μέσα στο 52.', 'transport', 4),
(12, 'Go', 'Πήγαινε στο ΤΜΗΜΑ ΤΕΧΝΟΛΟΓΙΑΣ ΤΡΟΦΙΜΩΝ.', 'transport', 10),
(13, 'Community Chest', 'Κέρδισες το 2ο βραβείο ομορφιάς. Παίρνεις $10.', 'money', 10),
(14, 'Community Chest', 'Από τους τόκους των χρημάτων σου λαμβάνεις $50.', 'money', 50),
(15, 'Community Chest', 'Έμαθες HTML με τον κ. Τεκτονίδη και πουλάς ιστοσελίδες part-time. Πάρε $100.', 'money', 100),
(16, 'Community Chest', 'Βρήκες ένα τάληρο στο πάτωμα. Πάρε $5.', 'money', 5),
(17, 'Community Chest', 'Έμαθες καλά Assembly και πέρασες τους συμφοιτητές σου στις διαδικτυακές εξετάσεις. Πάρε $50.', 'money', 50),
(18, 'Community Chest', 'Έμαθες καλά Java και πέρασες τους συμφοιτητές σου στις διαδικτυακές εξετάσεις. Πάρε $50.', 'money', 50),
(19, 'Community Chest', 'Έμαθες καλά SQL και πέρασες τους συμφοιτητές σου στις διαδικτυακές εξετάσεις. Πάρε $50.', 'money', 50),
(20, 'Community Chest', 'Οι φίλοι σου σε πληρώνουν χαρτζιλίκι που τους πηγαινοφέρνεις με το αμάξι Σίνδο-Θεσσαλονίκη. Πάρε $10.', 'money', 10),
(21, 'Community Chest', 'Πήγες στη γιαγιά σου και σε χαρτζιλίκωσε. Πάρε $20.', 'money', 20),
(22, 'Community Chest', 'Δούλεψες σεζόν και τα τσέπωσες. Πάρε $200.', 'money', 200),
(23, 'Community Chest', 'Πούλησες τα παλιά σου συγγράματα. Πάρε $50.', 'money', 50),
(24, 'Community Chest', 'Βρήκες ένα κορόιδο να αγοράσει το «potato» pc σου. Πάρε $200.', 'money', 200),
(25, 'Community Chest', 'Έκανες καλή επένδυση στο Bitcoin. Πάρε $50.', 'money', 50),
(26, 'Community Chest', 'Πέρασες επιτέλους τη «Σύνθεση Ηλεκτρονικών Κυκλωμάτων» και χάρηκαν οι γονείς σου. Πάρε $10.', 'money', 10),
(27, 'Community Chest', 'Πέρασες την «Ηλεκτρονική Φυσική» με την τέταρτη προσπάθεια και χάρηκαν οι γονείς σου. Πάρε $10.', 'money', 10),
(28, 'Community Chest', 'Έπαιξες «ΣΚΡΑΤΣ» για πρώτη φορά και νίκησες. Πάρε $10.', 'money', 10),
(29, 'Community Chest', 'Είναι τα γενέθλια σου. Πάρε $10 από κάθε παίκτη.', 'money', 10),
(30, 'Community Chest', 'Κληρονομείς $100.', 'money', 100),
(31, 'Community Chest', 'Τελείωσε η καραντίνα και πρέπει να αγοράσεις εξαρτήματα για εργαστήριο ηλεκτρονικών. Πλήρωσε $20.', 'money', -20),
(32, 'Community Chest', 'Σε έπιασαν με πλαστό πιστοποιητικό στην είσοδο. Πλήρωσε $100.', 'money', -100),
(33, 'Community Chest', 'Έξοδα γιατρού. Πλήρωσε $50.', 'money', -50),
(34, 'Community Chest', 'Αγόρασες κινέζικα καλώδια για το εργαστήριο στις «Ηλεκτρονικές Διατάξεις» και χάλασαν. Πλήρωσε $5 για καινούργια.', 'money', -5),
(35, 'Community Chest', 'Ευθυγραμίστηκαν οι πλανήτες και μπήκε ελεγκτής στο 52. Πλήρωσε $30.', 'money', -30),
(36, 'Community Chest', 'Σου τελειώνουν τα καύσιμα. Πλήρωσε $20 για να γεμίσεις το ντεπόζιτο.', 'money', -20);

-- --------------------------------------------------------

--
-- Struttura della tabella `Game`
--

CREATE TABLE `Game` (
  `id` int NOT NULL,
  `gameStatus` enum('lobby','inProgress','completed') DEFAULT NULL,
  `creator` int DEFAULT NULL,
  `playerTurn` int DEFAULT NULL,
  `timer` datetime DEFAULT NULL,
  `maxTime` int DEFAULT NULL,
  `maxMoney` int DEFAULT NULL,
  `winner` int DEFAULT NULL,
  `start_Time` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dump dei dati per la tabella `Game`
--

INSERT INTO `Game` (`id`, `gameStatus`, `creator`, `playerTurn`, `timer`, `maxTime`, `maxMoney`, `winner`, `start_Time`) VALUES
(1, 'completed', 1, 1, NULL, 2, 1000, 5, '2024-01-10 09:49:10'),
(2, 'completed', 1, 5, NULL, 1, 1000, 1, '2024-01-10 09:52:04'),
(3, 'completed', 1, 1, NULL, 5, 1000, 5, '2024-01-10 09:55:58'),
(4, 'completed', 1, 1, NULL, 10, 1000, 5, '2024-01-10 10:04:23'),
(5, 'completed', 1, 5, NULL, 3, 15000, 1, '2024-01-10 10:10:37'),
(6, 'completed', 1, 1, NULL, 2, 1000, 1, '2024-01-10 10:18:32'),
(7, 'completed', 1, 1, NULL, 20, 1000, 5, '2024-01-10 10:21:09'),
(8, 'completed', 1, 1, NULL, 2, 1000, 5, '2024-01-10 10:30:57'),
(9, 'completed', 1, 5, NULL, 2, 1000, 5, '2024-01-10 10:33:19'),
(10, 'completed', 1, 1, NULL, 2, 1000, 1, '2024-01-11 07:17:24');

-- --------------------------------------------------------

--
-- Struttura della tabella `Player`
--

CREATE TABLE `Player` (
  `id` int NOT NULL,
  `p_name` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dump dei dati per la tabella `Player`
--

INSERT INTO `Player` (`id`, `p_name`, `email`) VALUES
(1, 'VASILEIOS TSELANI', 'billyalani2001@gmail.com'),
(5, 'BOT', 'bot@asidirop.gr');

-- --------------------------------------------------------

--
-- Struttura della tabella `PlayerGame`
--

CREATE TABLE `PlayerGame` (
  `game_id` int DEFAULT NULL,
  `player_id` int NOT NULL,
  `square_id` int DEFAULT NULL,
  `money` int DEFAULT NULL,
  `inJail` tinyint(1) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Struttura della tabella `PlayerProperty`
--

CREATE TABLE `PlayerProperty` (
  `player` int DEFAULT NULL,
  `property` int NOT NULL,
  `game` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Struttura della tabella `Property`
--

CREATE TABLE `Property` (
  `id` int NOT NULL,
  `price` int DEFAULT NULL,
  `color` enum('RED','GREEN','BLUE','YELLOW','PURPLE','ORANGE','BROWN','GRAY') DEFAULT NULL,
  `rent` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Dump dei dati per la tabella `Property`
--

INSERT INTO `Property` (`id`, `price`, `color`, `rent`) VALUES
(1, 60, 'BROWN', 70),
(2, 60, 'BROWN', 70),
(3, 100, 'GRAY', 80),
(4, 100, 'GRAY', 80),
(5, 120, 'GRAY', 100),
(6, 140, 'PURPLE', 110),
(7, 140, 'PURPLE', 110),
(8, 160, 'PURPLE', 130),
(9, 180, 'ORANGE', 140),
(10, 180, 'ORANGE', 140),
(11, 200, 'ORANGE', 160),
(12, 220, 'RED', 170),
(13, 220, 'RED', 170),
(14, 240, 'RED', 190),
(15, 260, 'YELLOW', 200),
(16, 260, 'YELLOW', 200),
(17, 280, 'YELLOW', 220),
(18, 300, 'GREEN', 230),
(19, 300, 'GREEN', 230),
(20, 320, 'GREEN', 250),
(21, 350, 'BLUE', 270),
(22, 400, 'BLUE', 300);

-- --------------------------------------------------------

--
-- Struttura della tabella `Square`
--

CREATE TABLE `Square` (
  `id` int NOT NULL,
  `game` int DEFAULT NULL,
  `position` int DEFAULT NULL,
  `property` int DEFAULT NULL,
  `type` enum('property','jail','card','start','goToJail','parking') DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Indici per le tabelle scaricate
--

--
-- Indici per le tabelle `Card`
--
ALTER TABLE `Card`
  ADD PRIMARY KEY (`id`);

--
-- Indici per le tabelle `Game`
--
ALTER TABLE `Game`
  ADD PRIMARY KEY (`id`),
  ADD KEY `creator` (`creator`),
  ADD KEY `winner` (`winner`);

--
-- Indici per le tabelle `Player`
--
ALTER TABLE `Player`
  ADD PRIMARY KEY (`id`);

--
-- Indici per le tabelle `PlayerGame`
--
ALTER TABLE `PlayerGame`
  ADD PRIMARY KEY (`player_id`),
  ADD KEY `game_id` (`game_id`),
  ADD KEY `square_id` (`square_id`);

--
-- Indici per le tabelle `PlayerProperty`
--
ALTER TABLE `PlayerProperty`
  ADD PRIMARY KEY (`property`,`game`),
  ADD KEY `player` (`player`),
  ADD KEY `game` (`game`);

--
-- Indici per le tabelle `Property`
--
ALTER TABLE `Property`
  ADD PRIMARY KEY (`id`);

--
-- Indici per le tabelle `Square`
--
ALTER TABLE `Square`
  ADD PRIMARY KEY (`id`),
  ADD KEY `game` (`game`),
  ADD KEY `property` (`property`);

--
-- AUTO_INCREMENT per le tabelle scaricate
--

--
-- AUTO_INCREMENT per la tabella `Card`
--
ALTER TABLE `Card`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=37;

--
-- AUTO_INCREMENT per la tabella `Game`
--
ALTER TABLE `Game`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT per la tabella `Player`
--
ALTER TABLE `Player`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT per la tabella `Property`
--
ALTER TABLE `Property`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=23;

--
-- AUTO_INCREMENT per la tabella `Square`
--
ALTER TABLE `Square`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1881;

--
-- Limiti per le tabelle scaricate
--

--
-- Limiti per la tabella `Game`
--
ALTER TABLE `Game`
  ADD CONSTRAINT `Game_ibfk_1` FOREIGN KEY (`creator`) REFERENCES `Player` (`id`),
  ADD CONSTRAINT `Game_ibfk_2` FOREIGN KEY (`winner`) REFERENCES `Player` (`id`);

--
-- Limiti per la tabella `PlayerGame`
--
ALTER TABLE `PlayerGame`
  ADD CONSTRAINT `PlayerGame_ibfk_1` FOREIGN KEY (`game_id`) REFERENCES `Game` (`id`),
  ADD CONSTRAINT `PlayerGame_ibfk_2` FOREIGN KEY (`player_id`) REFERENCES `Player` (`id`),
  ADD CONSTRAINT `PlayerGame_ibfk_3` FOREIGN KEY (`square_id`) REFERENCES `Square` (`id`);

--
-- Limiti per la tabella `PlayerProperty`
--
ALTER TABLE `PlayerProperty`
  ADD CONSTRAINT `PlayerProperty_ibfk_1` FOREIGN KEY (`player`) REFERENCES `Player` (`id`),
  ADD CONSTRAINT `PlayerProperty_ibfk_2` FOREIGN KEY (`property`) REFERENCES `Property` (`id`),
  ADD CONSTRAINT `PlayerProperty_ibfk_3` FOREIGN KEY (`game`) REFERENCES `Game` (`id`);

--
-- Limiti per la tabella `Square`
--
ALTER TABLE `Square`
  ADD CONSTRAINT `Square_ibfk_1` FOREIGN KEY (`game`) REFERENCES `Game` (`id`),
  ADD CONSTRAINT `Square_ibfk_2` FOREIGN KEY (`property`) REFERENCES `Property` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;