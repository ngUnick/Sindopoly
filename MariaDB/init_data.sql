INSERT INTO Player(p_name, email) VALUES ('Vasilis','celanide@gmail.com'),('Ioannis','maou@gmail.com'),('Ioannis','skoul37@gmail.com'),('Nikos','megamart@gmail.com');

INSERT INTO Property (price,color,rent) VALUES 
(60,'BROWN',70),
(60,'BROWN',70),
(200, 'BROWN', 100),
(100,'GRAY',80),
(100,'GRAY',80),
(120,'GRAY',100),
(140,'PURPLE',110),
(150, 'PURPLE', 75),
(140,'PURPLE',110),
(160,'PURPLE',130),
(200, 'PURPLE', 100),
(180,'ORANGE',140),
(180,'ORANGE',140),
(200,'ORANGE',160),
(220,'RED',170),
(220,'RED',170),
(240,'RED',190),
(200, 'RED', 100),
(260,'YELLOW',200),
(260,'YELLOW',200),
(150, 'YELLOW', 75),
(280,'YELLOW',220),
(300,'GREEN',230),
(300,'GREEN',230),
(320,'GREEN',250),
(200, 'GREEN', 100),
(350,'BLUE',270),
(400,'BLUE',300);


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