package org.springframework.samples.petclinic.owner;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;

@Controller
class OwnerController {

	@Autowired
	private OwnerRepository owners;

}
