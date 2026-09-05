package org.springframework.samples.petclinic.owner;

import org.springframework.samples.petclinic.model.Person;
import org.springframework.ui.Model;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "owners")
public class Owner extends Person {

	public void describe(Model model) {
		model.addAttribute("owner", this);
	}

}
