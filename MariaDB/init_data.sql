INSERT INTO Player(p_name, email) VALUES ('Vasilis','celanide@gmail.com'),('Ioannis','maou@gmail.com'),('Ioannis','skoul37@gmail.com'),('Nikos','megamart@gmail.com');

-- Initialize Squares ─────────────────────────────────────────────────────────
INSERT INTO Square(id, s_type, price, rent) VALUES
-- 0–9 ─────────────────────────────────────────────────────────
 ( 0,'START'  ,  NULL ,  NULL ),
 ( 1,'BROWN'  ,     60,     2 ),
 ( 2,'CARD'   ,  NULL ,  NULL ),
 ( 3,'BROWN'  ,     60,     4 ),
 ( 4,'TAX'    ,   -200,  NULL ),
 ( 5,'TRAIN'  ,    200,    25 ),
 ( 6,'CYAN'   ,    100,     6 ),
 ( 7,'CARD'   ,  NULL ,  NULL ),
 ( 8,'CYAN'   ,    100,     6 ),
 ( 9,'CYAN'   ,    120,     8 ),
-- 10–19 ───────────────────────────────────────────────────────
 (10,'JAIL'   ,  NULL ,  NULL ),
 (11,'PURPLE' ,    140,    10 ),
 (12,'UTILITY',    150,  NULL ),   -- rent = dice×4 / ×10 (handled in code)
 (13,'PURPLE' ,    140,    10 ),
 (14,'PURPLE' ,    160,    12 ),
 (15,'TRAIN'  ,    200,    25 ),
 (16,'ORANGE' ,    180,    14 ),
 (17,'CARD'   ,  NULL ,  NULL ),
 (18,'ORANGE' ,    180,    14 ),
 (19,'ORANGE' ,    200,    16 ),
-- 20–29 ───────────────────────────────────────────────────────
 (20,'PARKING',  NULL ,  NULL ),
 (21,'RED'    ,    220,    18 ),
 (22,'CARD'   ,  NULL ,  NULL ),
 (23,'RED'    ,    220,    18 ),
 (24,'RED'    ,    240,    20 ),
 (25,'TRAIN'  ,    200,    25 ),
 (26,'YELLOW' ,    260,    22 ),
 (27,'YELLOW' ,    260,    22 ),
 (28,'UTILITY',    150,  NULL ),
 (29,'YELLOW' ,    280,    24 ),
-- 30–39 ───────────────────────────────────────────────────────
 (30,'GOJAIL' ,  NULL ,  NULL ),
 (31,'GREEN'  ,    300,    26 ),
 (32,'GREEN'  ,    300,    26 ),
 (33,'CARD'   ,  NULL ,  NULL ),
 (34,'GREEN'  ,    320,    28 ),
 (35,'TRAIN'  ,    200,    25 ),
 (36,'CARD'   ,  NULL ,  NULL ),
 (37,'BLUE'   ,    350,    35 ),
 (38,'TAX'    ,   -100,  NULL ),   -- luxury tax
 (39,'BLUE'   ,    400,    50 );



-- Example 1
INSERT INTO Card (title, description, type, amount)
VALUES ('Go', 'Ο φίλος σου που έχει αμάξι έφυγε πιο νωρίς σήμερα. Πήγαινε 2 θέσεις μπροστά.', 'transport', 2);


-- Example 2
INSERT INTO Card (title, description, type, amount)
VALUES ('Go', 'Έχεις 3 ώρες κενό μέχρι το επόμενο μάθημα. Πήγαινε 3 θέσεις πίσω.', 'transport', -3);


-- Example 3
INSERT INTO Card (title, description, type, amount)
VALUES ('Go', 'Σε πλησιάζει ο Μάριος από την ΜΠΡΙΖΑ. Πήγαινε 5 θέσεις μπροστά.', 'transport', 5);


-- Example 4
INSERT INTO Card (title, description, type, amount)
VALUES ('Go', 'Ακυρώθηκε το εργαστήριο σου και δεν έχεις τί να κάνεις. Πήγαινε 2 θέσεις πίσω.', 'transport', -2);


-- Example 5
INSERT INTO Card (title, description, type, amount)
VALUES ('Go', 'Η στάση του ΔΙ.ΠΑ.Ε. είναι γεμάτη. Πήγαινε 4 θέσεις μπροστά.', 'transport', 4);


-- Example 6
INSERT INTO Card (title, description, type, amount)
VALUES ('Go', 'Πήγαινε 1 θέση μπροστά.', 'transport', 3);


-- Example 7
INSERT INTO Card (title, description, type, amount)
VALUES ('Go', 'Δεν έχεις καθηγητές αυτό το εξάμηνο και δεν θα έχεις μαθηματα να δηλώσεις. Πήγαινε 5 θέσεις πίσω.', 'transport', -5);


-- Example 8
INSERT INTO Card (title, description, type, amount)
VALUES ('Go', 'Πήγαινε 1 θέση πίσω.', 'transport', -1);


-- Example 9
INSERT INTO Card (title, description, type, amount)
VALUES ('Go', 'Έχεις 3 ώρες κενό μέχρι το επόμενο μάθημα. Πήγαινε 2 θέσεις πίσω.', 'transport', -2);


-- Example 10
INSERT INTO Card (title, description, type, amount)
VALUES ('Go', 'Χώρισες με την κοπέλα σου και θέλεις να κάνεις γνωριμίες. Πήγαινε 3 θέσεις πίσω.', 'transport', -3);


-- Example 11
INSERT INTO Card (title, description, type, amount)
VALUES ('Go', 'Χώρισες με το αγόρι σου και θέλεις να κάνεις γνωριμίες. Πήγαινε 3 θέσεις πίσω.', 'transport', -3);


-- Example 12
INSERT INTO Card (title, description, type, amount)
VALUES ('Go', 'Έκανες μάθημα με τον κ. Γουλιάνα. Δεν άκουσες τίποτα από την φασαρία αλλά γνώρισες νέους συμφοιτητές. Πήγαινε 4 θέση μπροστά.', 'transport', 4);


-- Example 13
INSERT INTO Card (title, description, type, amount)
VALUES ('Go', 'Ο Μάριος απο την ΜΠΡΙΖΑ διέκοψε πάλι το μάθημα. Πήγαινε 2 θέσεις πίσω.', 'transport', -2);







-- Example 1
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Κέρδισες το τουρνουά Tekken της Ναυτίλου. Πάρε $12.', 'money', 12);


-- Example 2
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Έμαθες HTML με τον κ. Τεκτονίδη και πουλάς ιστοσελίδες part-time. Πάρε $100.', 'money', 100);


-- Example 3
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Έμαθες καλά Java και πέρασες τους συμφοιτητές σου στις διαδικτυακές εξετάσεις. Πάρε $50.', 'money', 50);


-- Example 4
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Πούλησες τα παλιά σου συγγράματα. Πάρε $50.', 'money', 50);


-- Example 5
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Βρήκες ενα κορόιδο να αγοράσει το «potato» pc σου. Πάρε $200.', 'money', 200);


-- Example 6
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Πέρασες επιτέλους τη «Σύνθεση Ηλεκτρονικών Κυκλωμάτων» και χάρηκαν οι γονείς σου. Πάρε $10.', 'money', 10);


-- Example 7
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Πρέπει να αγοράσεις εξαρτήματα για εργαστήριο ηλεκτρονικής. Πλήρωσε $20.', 'money', 20);


-- Example 8
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Πούλησες συγγράματα στο metabook. Πάρε $50.', 'money', 50);


-- Example 9
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Βρήκες ένα τάλιρο στο πάτωμα. Πάρε $5.', 'money', 5);


-- Example 10
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Έμαθες καλά Assembly και πέρασες τους συμφοιτητές σου στις διαδικτυακές εξετάσεις. Πάρε $50.', 'money', 50);


-- Example 11
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Έμαθες καλά SQL και πέρασες τους συμφοιτητές σου στις διαδικτυακές εξετάσεις. Πάρε $50.', 'money', 50);


-- Example 12
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Δούλεψες σεζόν και τα τσέπωσες. Πάρε $200.', 'money', 200);


-- Example 13
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Είναι τα γενέθλια σου. Πάρε $10 από κάθε παίκτη.', 'money', 10);


-- Example 14
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Κληρονομείς $100.', 'money', 100);


-- Example 15
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Βρήκες παλιούς επεξεργαστές, τους έκανες μπρελόκ και τους πούλησες στους φίλους σου. Πάρε $20.', 'money', 20);


-- Example 16
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Αγόρασες κινέζικα καλώδια για το εργαστήριο στις «Ηλεκτρονικές Διατάξεις» και χάλασαν. Πλήρωσε $5 για καινούργια.', 'money', -5);



-- Example 17
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Ευθυγραμίστηκαν οι πλανήτες και μπήκε ελεγκτής στο 52. Πλήρωσε $30.', 'money', -30);


-- Example 18
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Κόπηκες στην «Ηλεκτρονική Φυσική» για 4η φορά. Πλήρωσε $50 κάποιον να σου περάσει το μάθημα.', 'money', -50);


-- Example 19
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Έληξε η κάρτα του ΟΑΣΘ. Πλήρωσε $15.', 'money', -15);


-- Example 20
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Κόπηκες για πολλοστή φορά στο εργαστήριο των «Αισθητηρίων και Επεξεργασίας Μετρήσεων» και πρέπει να πληρώσεις κάποιον να σου περάσει το μάθημα. Πλήρωσε $50.', 'money', -50);


-- Example 21
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Χάλασες το ποδοσφαιράκι στην Ναυτίλο. Πλήρωσε $20.', 'money', -20);


-- Example 22
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Θες να μπεις στην ΙΕΕΕ. Πλήρωσε $27 για τη συνδρομή.', 'money', -27);


-- Example 23
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Δεν έχουν δεχτεί ακόμα την αίτηση σου για σίτιση. Πλήρωσε $3.5 για να φας.', 'money', -3.5);


-- Example 24
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Συμφοιτητής σου σε πηγαινοφέρνει Σίνδο-Θεσσαλονίκη με το αμάξι. Πλήρωσε $5 για να τον κεράσεις καφέ.', 'money', -5);


-- Example 25
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Σου κλέψανε τις πινακίδες. Πλήρωσε $50.', 'money', -50);


-- Example 26
INSERT INTO Card (title, description, type, amount)
VALUES ('Community Chest', 'Κάνεις απαλλακτική για απτικές διεπαφές. Πλήρωσε $50 για τα εξαρτήματα.', 'money', -50);