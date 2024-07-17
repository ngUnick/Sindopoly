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


-- MovePlayerCards --------------------

-- Example 1
INSERT INTO Card (description, type, amount)
VALUES ('Ο φίλος σου που έχει αμάξι έφυγε πιο νωρίς σήμερα. Πήγαινε στην στάση «ΙΘΑΚΗ» να πάρεις το 52.', 'transport', 8);


-- Example 2
INSERT INTO Card (description, type, amount)
VALUES ('Σε πλησιάζει ο Μάριος από την ΜΠΡΙΖΑ. Πήγαινε στην ΑΦΕΤΗΡΙΑ για να ξεφύγεις.', 'transport', 0);


-- Example 3
INSERT INTO Card (description, type, amount)
VALUES ('Έκανες μάθημα με τον κ. Γουλιάνα. Δεν άκουσες τίποτα από την φασαρία αλλά γνώρισες νέους συμφοιτητές. Πήγαινε στο ΜΙΚΕΛ.', 'transport', 14);


-- Example 4
INSERT INTO Card (description, type, amount)
VALUES ('Η στάση του ΔΙ.ΠΑ.Ε. είναι γεμάτη. Περπάτα μέχρι την ΣΤΑΣΗ ΤΕΡΜΑΤΙΚΟΥ και ίσως καταφέρεις να μπεις στο 52.', 'transport', 9);


-- Example 5
INSERT INTO Card (description, type, amount)
VALUES ('Ο Μάριος απο την ΜΠΡΙΖΑ διέκοψε πάλι το μάθημα. Πήγαινε στo ΣΠΛΑΣ για να ηρεμήσεις.', 'transport', 11);


-- Example 6
INSERT INTO Card (description, type, amount)
VALUES ('Πήγαινε στο ΤΜΗΜΑ ΠΛΗΡΟΦΟΡΙΚΗΣ.', 'transport', 37);


-- Example 7
INSERT INTO Card (description, type, amount)
VALUES ('Χώρισες με την κοπέλα σου και θέλεις να κάνεις γνωριμίες. Πήγαινε στο ΚΙΟΣΚΙ Σ.Ε.Υ.Π.', 'transport', 5);


-- Example 8
INSERT INTO Card (description, type, amount)
VALUES ('Έχεις 3 ώρες κενό μέχρι το επόμενο μάθημα. Πήγαινε στη ΝΑΥΤΙΛΟ για προδοσφαιράκι.', 'transport', 20);


-- Example 9
INSERT INTO Card (description, type, amount)
VALUES ('Πήγαινε στο ΤΜΗΜΑ ΗΛΕΚΤΡΟΝΙΚΗΣ.', 'transport', 39);


-- Example 10
INSERT INTO Card (description, type, amount)
VALUES ('Έχεις 3 ώρες κενό μέχρι το επόμενο μάθημα. Πήγαινε στο ΚΥΛΙΚΕΙΟ.', 'transport', 12);


-- Example 11
INSERT INTO Card (description, type, amount)
VALUES ('Έχεις 3 ώρες κενό μέχρι το επόμενο μάθημα. Πήγαινε στη ΛΕΣΧΗ.', 'transport', 28);


-- Example 12
INSERT INTO Card (description, type, amount)
VALUES ('Δεν έχεις καθηγητές αυτό το εξάμηνο και δεν θα έχεις μαθηματα να δηλώσεις. Πήγαινε στο ΚΙΟΣΚΙ ΕΞΟΔΟΥ.', 'transport', 25);


-- Example 13
INSERT INTO Card (description, type, amount)
VALUES ('Πήγαινε στην ΑΦΕΤΗΡΙΑ.', 'transport', 0);

-- Example 14
INSERT INTO Card (description, type, amount)
VALUES ('Χώρισες με το αγόρι σου και θέλεις να κάνεις γνωριμίες. Πήγαινε στο ΚΙΟΣΚΙ ΠΛΗΡΟΦΟΡΙΚΗΣ.', 'transport', 35);

-- Example 15
INSERT INTO Card (description, type, amount)
VALUES ('Ακυρώθηκε το εργαστήριο σου και δεν έχεις τί να κάνεις. Πήγαινε στο ΠΟΔΗΛΑΤΟ.', 'transport', 13);




-- MoneyCards --------------------

-- Example 1
INSERT INTO Card (description, type, amount)
VALUES ('Κόπηκες στην "Ηλεκτρονική Φυσική" για 4η φορά. Πλήρωσε $50 για να σου κάνουν ιδιαίτερα.', 'money', 50);


-- Example 2
INSERT INTO Card (description, type, amount)
VALUES ('Ευθυγραμίστηκαν οι πλανήτες και μπήκε ελεγκτής στο 52. Πλήρωσε $30.', 'money', -30);


-- Example 3
INSERT INTO Card (description, type, amount)
VALUES ('Οι φίλοι σου σε πληρώνουν χαρτζιλίκι που τους πηγαινοφέρνεις με το αμάξι Σίνδο-Θεσσαλονίκη. Πάρε $10 από κάθε παίκτη.', 'money', 10); -- more complicated than it seems


-- Example 4
INSERT INTO Card (description, type, amount)
VALUES ('Έμαθες HTML με τον κ. Τεκτονίδη και πουλάς ιστοσελίδες part-time. Πάρε $100.', 'money', 100);


-- Example 5
INSERT INTO Card (description, type, amount)
VALUES ('Δεν έχουν δεχτεί ακόμα την αίτηση σου για σίτιση. Πλήρωσε $3.5 για να φας.', 'money', -3.5); -- needs float or similar numeric data type


-- Example 6
INSERT INTO Card (description, type, amount)
VALUES ('Αγόρασες κινέζικα καλώδια για το εργαστήριο στις «Ηλεκτρονικές Διατάξεις» και χάλασαν. Πλήρωσε $5 για καινούργια.', 'money', -5);


-- Example 7
INSERT INTO Card (description, type, amount)
VALUES ('Συμφοιτητής σου σε πηγαινοφέρνει Σίνδο-Θεσσαλονίκη με το αμάξι. Πλήρωσε $5 για να τον κεράσεις καφέ.', 'money', 5);


-- Example 8
INSERT INTO Card (description, type, amount)
VALUES ('Πούλησες τα παλιά σου συγγράματα. Πάρε $50.', 'money', 50);


-- Example 9
INSERT INTO Card (description, type, amount)
VALUES ('Έληξε η κάρτα του ΟΑΣΘ. Πλήρωσε $15.', 'money', -15);


-- Example 10
INSERT INTO Card (description, type, amount)
VALUES ('Θες να μπεις στο φοιτητικό παράρτημα της ΙΕΕΕ. Πλήρωσε $27 για τη συνδρομή.', 'money', -27);


-- Example 11
INSERT INTO Card (description, type, amount)
VALUES ('Έμαθες καλά Java και έκανες ιδιαίτερα σε συμφοιτητές σου. Πάρε $50.', 'money', 50);


-- Example 12
INSERT INTO Card (description, type, amount)
VALUES ('Είναι τα γενέθλια σου. Πάρε $10 από κάθε παίκτη.', 'money', 10); -- more complicated than it seems


-- Example 13
INSERT INTO Card (description, type, amount)
VALUES ('Κέρδισες το τουρνουά Tekken της Ναυτίλου. Πάρε $12.', 'money', 12);


-- Example 14
INSERT INTO Card (description, type, amount)
VALUES ('Πρέπει να αγοράσεις εξαρτήματα για εργαστήριο ηλεκτρονικής. Πλήρωσε $20.', 'money', -20);


-- Example 15
INSERT INTO Card (description, type, amount)
VALUES ('Χάλασες το ποδοσφαιράκι στην Ναυτίλο. Πλήρωσε $20.', 'money', -20);


-- Example 16
INSERT INTO Card (description, type, amount)
VALUES ('Έμαθες καλά Assembly και έκανες ιδιαίτερα σε συμφοιτητές σου. Πάρε $50.', 'money', 50);



-- Example 17
INSERT INTO Card (description, type, amount)
VALUES ('Βρήκες ενα κορόιδο να αγοράσει το "potato" pc σου. Πάρε $200.', 'money', 200);


-- Example 18
INSERT INTO Card (description, type, amount)
VALUES ('Έμαθες καλά SQL και έκανες ιδιαίτερα σε συμφοιτητές σου. Πάρε $50.', 'money', 50);


-- Example 19
INSERT INTO Card (description, type, amount)
VALUES ('Βρήκες παλιούς επεξεργαστές, τους έκανες μπρελόκ και τους πούλησες στους φίλους σου. Πάρε $20.', 'money', 20);


-- Example 20
INSERT INTO Card (description, type, amount)
VALUES ('Δούλεψες σεζόν και τα τσέπωσες. Πάρε $200.', 'money', 200);


-- Example 21
INSERT INTO Card (description, type, amount)
VALUES ('Βρήκες ένα τάλιρο στο πάτωμα. Πάρε $5.', 'money', 5);


-- Example 22
INSERT INTO Card (description, type, amount)
VALUES ('Κάνεις απαλλακτική για το μάθημα "Απτικές Διεπαφές". Πλήρωσε $50 για τα εξαρτήματα.', 'money', -50);


-- Example 23
INSERT INTO Card (description, type, amount)
VALUES ('Κόπηκες για πολλοστή φορά στο εργαστήριο των «Αισθητηρίων και Επεξεργασίας Μετρήσεων» και πρέπει να πληρώσεις κάποιον να σου κάνει ιδιαίτερα. Πλήρωσε $50.', 'money', -50);


-- Example 24
INSERT INTO Card (description, type, amount)
VALUES ('Σου κλέψανε τις πινακίδες. Πλήρωσε $50.', 'money', -50);


-- Example 25
INSERT INTO Card (description, type, amount)
VALUES ('Πέρασες επιτέλους τη "Σύνθεση Ηλεκτρονικών Κυκλωμάτων" και χάρηκαν οι γονείς σου. Πάρε $20.', 'money', -20);


-- Example 26
INSERT INTO Card (description, type, amount)
VALUES ('Πούλησες συγγράματα στο metabook. Πάρε $50.', 'money', 50);



-- JailCards --------------------

-- Example 1
INSERT INTO Card (description, type, amount)
VALUES ('Σε έπιασε ο φαλακρός ελεγκτής του 52 χωρίς εισιτήριο. Πάνε στην ΦΥΛΑΚΗ.', 'jail', 0);

-- Example 2
INSERT INTO Card (description, type, amount)
VALUES ('Σε έπιασαν να αντιγράφεις. Πάνε στη ΦΥΛΑΚΗ.', 'jail', 0);

-- Example 3
INSERT INTO Card (description, type, amount)
VALUES ('Σε πιάσανε να κολλάς αφίσες για τον Γουλιάνα. Πάνε στη ΦΥΛΑΚΗ.', 'jail', 0);

-- Example 4
INSERT INTO Card (description, type, amount)
VALUES ('Σε πιάσανε να μοιράζεις φυλλάδια για τον Αντωνίου και τον Τζέκη. Πάνε στη ΦΥΛΑΚΗ.', 'jail', 0);

-- Example 5
INSERT INTO Card (description, type, amount)
VALUES ('Ξέχασες να επιστρέψεις σύγγραμα στη βιβλιοθήκη. Πάνε στη ΦΥΛΑΚΗ.', 'jail', 0);